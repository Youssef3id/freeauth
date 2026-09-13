# OpenAuth — Adapter Architecture

This document is the single source of truth for how OpenAuth separates auth logic from
database logic. Read this before writing or modifying any code under `core/` or `adapters/`.

If anything in a prompt or a PR contradicts this document, this document wins. Update it
first, then write the code.

---

## 1. The core idea

OpenAuth is not an auth **service** (not OAuth, not a hosted identity provider). It is a
**library** developers drop into their own backend, wired to whatever database/ORM they
already use.

To make that possible, the codebase is split into two things that must never mix:

- **Core** — all auth *logic*. Hashing, OTP generation/verification, JWT issuing, session
  rotation rules, lockout rules. This code is **the same for every user of OpenAuth**,
  regardless of their database.
- **Adapter** — all *data access*. Translates the core's requests ("find this user by
  email") into whatever a specific ORM/database needs (Mongoose query, Prisma query,
  Supabase client call, etc).

**Rule: Core never imports a database driver, an ORM client, or a model. It only ever
talks to the `AuthAdapter` interface.** If you find yourself importing `mongoose`,
`@prisma/client`, or any DB client inside `core/`, stop — that logic belongs in an
adapter.

---

## 2. Why the contract is strict, not flexible

We considered letting `UserRecord`/`SessionRecord` be loosely typed (e.g.
`[key: string]: unknown`) so adapters could pass through whatever shape their own schema
has, and let the core figure it out at read time.

**We rejected this.** Reasoning:

- A flexible contract doesn't remove the need to translate one dev's schema into a
  common shape — it just moves that translation from the adapter (one place, written
  once) into the core (many places, defensive `??` fallbacks scattered through business
  logic).
- The whole point of an adapter pattern is that the core stays boring and simple. A
  flexible contract quietly reintroduces the exact "logic and data access mixed
  together" problem the original `smart-auth-system` audit flagged as the #1
  architectural issue.
- A strict contract fails fast, at the adapter boundary, usually at compile time. A
  loose contract fails late, deep inside core logic, at runtime, in a way that's hard to
  trace back to its source.

**Rule: every adapter must return data in exactly the shape defined below. Any
translation between a user's actual DB schema and this shape happens inside their
adapter, never inside core.**

---

## 3. Data shapes

```typescript
interface UserRecord {
  id: string; // always a string — adapter must convert ObjectId/number/uuid itself
  email: string;
  name: string;
  password: string; // hash, never plaintext

  isAccountVerified: boolean;

  verifyOTP: string | null; // hash of the OTP, never plaintext
  verifyOTPExpire: number | null; // epoch ms
  verifyAttempts: number;
  verifyLockUntil: Date | null;

  resetOTP: string | null;
  resetOTPExpire: number | null;
  resetAttempts: number;
  resetLockUntil: Date | null;
}

interface SessionRecord {
  userId: string;
  token: string;
  isRevoked: boolean;
  expiresAt: Date;
  createdAt: Date;
}
```

Notes:

- `verify*` and `reset*` OTP state are tracked **separately** (separate attempt counters
  and separate lockouts). The original backend shared one counter for both flows; we
  caught this ourselves in that project's own security audit (a reset-OTP brute-force
  attempt would lock out email verification, and vice versa) and are not repeating it
  here now that we're building the contract from scratch.
- `createdAt` on `SessionRecord` costs nothing to add now and unblocks future features
  (e.g. "show active sessions", "log out other devices") without a breaking contract
  change later. Cheap now beats a migration later.

---

## 4. The adapter interface

```typescript
interface UserAdapter {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;

  create(data: {
    email: string;
    name: string;
    password: string; // already hashed by core before calling this
    verifyOTP: string;
    verifyOTPExpire: number;
  }): Promise<UserRecord>;

  updatePassword(id: string, hashedPassword: string): Promise<void>;

  markVerified(id: string): Promise<void>;

  setVerifyOTP(id: string, otp: string, expiresAt: number): Promise<void>;
  setResetOTP(id: string, otp: string, expiresAt: number): Promise<void>;
  clearVerifyOTP(id: string): Promise<void>; // clears verifyOTP/verifyOTPExpire, mirroring clearResetOTP
  clearResetOTP(id: string): Promise<void>;

  /**
   * Increment a flow's OTP attempt counter and return the authoritative
   * post-increment count. The core uses this return value to decide whether
   * the lockout threshold (currently 5) has been reached — it must never
   * guess the count from a record read at the start of the flow and assume
   * no concurrent attempts happened. Two concurrent wrong-OTP submissions
   * could both read count=4, and neither would trigger the lock. The
   * adapter's increment must be the single source of truth for the count,
   * the same way revoke() is the single source of truth for revocation state.
   */
  incrementOtpAttempts(id: string, type: 'verify' | 'reset'): Promise<number>;
  setOtpLock(id: string, type: 'verify' | 'reset', lockUntil: Date): Promise<void>;
  /**
   * Reset a flow's OTP attempt counter AND its lock in a single call — a
   * successful OTP verification always resets attempts and lock together.
   * Clears verifyLockUntil for type 'verify', resetLockUntil for type 'reset'.
   */
  resetOtpAttempts(id: string, type: 'verify' | 'reset'): Promise<void>;
}

interface SessionAdapter {
  create(data: { userId: string; token: string; expiresAt: Date }): Promise<SessionRecord>;

  findValid(token: string): Promise<SessionRecord | null>;

  /**
   * Revoke a refresh token. MUST be a single atomic operation —
   * e.g. Mongoose: findOneAndUpdate({ token, isRevoked: false }, { isRevoked: true })
   *      Prisma:   updateMany({ where: { token, isRevoked: false }, data: { isRevoked: true } })
   *                then check the affected-row count
   *
   * Returns false if the token was ALREADY revoked when this call ran. The core
   * treats a false return as a reuse attack (someone used a token that had already
   * been used) and wipes every session for that user.
   *
   * A "find, then check, then save" implementation (two separate steps) reintroduces
   * a race condition: two concurrent refresh calls with the same stolen token can
   * both read isRevoked:false before either one writes, and both succeed. This is
   * not a hypothetical — it was a real bug in the original backend (see its audit,
   * finding S10), and it must not be reintroduced by any adapter.
   */
  revoke(token: string): Promise<boolean>;

  revokeAllForUser(userId: string): Promise<void>;
}

interface AuthAdapter {
  users: UserAdapter;
  sessions: SessionAdapter;
}
```

Why specific named methods (`markVerified`, `setResetOTP`, ...) instead of one generic
`update(id, partialData)`:

- Each method has one obvious purpose and one obvious calling point in core. Anyone
  writing a new adapter can see exactly when each one fires.
- A generic `update` pushes the responsibility of "which fields does *this* action
  touch" onto whoever writes the adapter — the same flexibility-shifts-complexity
  problem from section 2, just at the method level instead of the data-shape level.

---

## 5. What "core" actually looks like after this refactor

`core/authService.ts`'s business logic (bcrypt calls, JWT signing, OTP generation, lockout
rules, rotation/reuse-detection rules) **does not change**. The only thing that changes
is where its data comes from:

```javascript
// before (current smart-auth-system)
const user = await userModel.findOne({ email });

// after (core, adapter-based)
const user = await adapter.users.findByEmail(email);
```

Everything else in the function — password verification, token issuing, error
throwing — stays exactly as-is.

The first real adapter is `mongooseAdapter()`, and it is essentially the legacy
`repositories/userRepository.js` and `repositories/sessionRepository.js` (since
removed), relocated into `adapters/mongoose.ts` and reshaped to satisfy the
interface above. No new logic — a relocation with a translation layer.

---

## 6. Agent rules for this project

These apply to any coding agent working on `core/` or `adapters/` in this repo:

1. **Core code never imports a DB driver, ORM client, or model.** If a prompt asks for
   something that would require this, stop and flag it instead of finding a workaround.
2. **Every adapter's `revoke()` must be a single atomic DB operation**, per the JSDoc
   comment on `SessionAdapter.revoke` above. Do not implement it as a separate
   find-then-save/find-then-update sequence, in any adapter, ever.
3. **Don't invent new `AuthAdapter` methods without discussing it first.** If a task
   seems to need a new adapter method, say so and describe what it would do — don't add
   it silently, since every adapter (including ones written by other developers later)
   would need to implement it.
4. **Match the existing shapes and method names in section 3 and 4 exactly.** Don't
   rename fields or reorganize the interface "for clarity" — if something seems
   awkward, flag it for discussion rather than changing it unilaterally.
5. **Keep testing simple.** No headless-browser tests, no smoke-test frameworks, no
   heavyweight test scaffolding for this backend work. If a test is genuinely useful,
   it should be a plain, direct unit test of one function — nothing more elaborate than
   that, and only when explicitly asked for.
6. **Stay inside the scope of the prompt.** Don't restructure files, rename things, or
   "improve" adjacent code that wasn't asked for in the current task — this applies to
   backend work specifically, where scope creep is expensive to review.
7. **The `mongooseAdapter` is a relocation, not a rewrite.** When building it, the
   expectation is that the existing repository logic moves with minimal changes beyond
   what's needed to satisfy the interface — not a chance to redesign the Mongoose
   queries themselves.

---

## 7. Status

- [x] Core vs. adapter separation agreed
- [x] Strict-contract decision agreed (over a flexible/loose contract)
- [x] `UserRecord` / `SessionRecord` shapes finalized
- [x] `UserAdapter` / `SessionAdapter` method signatures finalized
- [x] `core/types.ts` written
- [x] `authService.js` decoupled from Mongoose, rebuilt against `AuthAdapter`
- [ ] `mongooseAdapter()` implemented (first real adapter, ports existing repositories)
- [ ] Package structure decision (single package with subpath exports vs. monorepo) —
      **not yet decided, still open**
