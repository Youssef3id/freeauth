# Smart Auth System

Node.js Express 5 MongoDB JWT Zod bcryptjs

A production-ready REST API for authentication built with Node.js, Express 5, and MongoDB — featuring a secure dual-token strategy with httpOnly cookies, token revocation, server-side session tracking, and centralized error handling.

## Features

- **Dual-token JWT auth** — Access tokens (15min) + refresh tokens (7 days) with httpOnly cookies, zero token exposure to JavaScript
- **Server-side revocation** — Refresh tokens stored in MongoDB with `isRevoked` flag; logout actually kills the session
- **Centralized error handling** — Custom `AppError` class catches Zod (422), JWT (401), and Mongoose (400/409) errors in one place
- **Zod validation** — All inputs validated before hitting the database with per-field error messages
- **Five-tier rate limiting** — Global (100/15min), login (5/15min), register (10/hour), refresh (20/15min), password reset (5/30min)
- **Password hashing** — bcryptjs with 10 salt rounds
- **TTL index** — Expired refresh tokens auto-purged by MongoDB, no cleanup scripts needed
- **Modular utilities** — Token generation, cookie options, and validation schemas extracted into reusable modules
- **Logger utility** — Structured logging with `[INFO]`, `[WARN]`, `[ERROR]`, `[DEBUG]` levels
- **Email verification via OTP** — Required before login; OTP generated on registration with 10-minute expiry
- **Password reset via OTP** — 10-minute expiry OTP sent on forgot-password request
- **Token rotation on refresh** — Old refresh token revoked, new pair issued; sliding session window
- **Refresh token reuse detection** — Revokes all user sessions on suspicious token reuse
- **Change password** — Authenticated endpoint for password updates

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + Express 5 |
| Database | MongoDB + Mongoose 9 |
| Auth | JWT (jsonwebtoken) |
| Validation | Zod 4 |
| Security | bcryptjs, express-rate-limit, cookie-parser, helmet |
| Email | nodemailer (ready for password reset / verification) |

## Project Structure

```
Authsystem/
├── app.js                          # Entry point, middleware, CORS, rate limiter
├── config/
│   ├── cookie.js                   # Centralized httpOnly cookie options (access + refresh)
│   └── env.js                      # Zod env validation schema (PORT, MONGODB_URL, secrets)
├── controllers/
│   └── auth/
│       ├── authController.js       # All business logic (register, login, logout, refresh, me)
│       └── authValidation.js       # Zod schemas (register, login, forgot/reset password)
├── middleware/
│   ├── authMiddleware.js           # JWT access token verification from cookies/headers
│   ├── errorHandler.js             # AppError class + centralized error handler
│   ├── rateLimiter.js              # Global + auth-specific rate limiters
│   └── validate.js                 # Zod middleware wrapper → forwards errors to handler
├── model/
│   ├── mongodb.js                  # Mongoose connection with error handling
│   ├── userModel.js                # User schema (name, email, password, OTP, verification)
│   └── refreshToken.js             # Refresh token schema (userId, token, expiresAt, isRevoked)
├── routes/
│   └── authRoutes.js               # Route definitions with rate limiters + validation
├── utils/
│   ├── authTokens.js               # generateAccessToken / generateRefreshToken / verify stubs
│   └── logger.js                   # Structured logger (info, warn, error, debug)
├── .env                            # Environment variables (ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, MONGODB_URL, PORT)
├── .gitignore
├── package.json
├── README.md
└── server.log
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- MongoDB instance (local or Atlas)

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
PORT=5000
MONGODB_URL=mongodb://localhost:27017/authdb
ACCESS_TOKEN_SECRET=your_access_token_secret
REFRESH_TOKEN_SECRET=your_refresh_token_secret
NODE_ENV=development
```

### Run Development

```bash
npm run dev
```

Starts with nodemon at `http://localhost:5000`.

### Production

```bash
npm start
```

## API Endpoints

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| GET | `/api/auth/` | No | Health check |
| POST | `/api/auth/register` | No | Create new account |
| POST | `/api/auth/login` | No | Login and receive tokens |
| POST | `/api/auth/logout` | No | Revoke session |
| POST | `/api/auth/refresh` | No | Issue new access token |
| GET | `/api/auth/me` | Yes | Get current user profile |
| POST | `/api/auth/forgot-password` | No | Request password reset OTP |
| POST | `/api/auth/reset-password` | No | Reset password using OTP |
| POST | `/api/auth/verify-email` | No | Verify email using OTP |
| POST | `/api/auth/resend-otp` | No | Resend verification OTP |
| POST | `/api/auth/change-password` | Yes | Change password (authenticated) |

## Authentication Flow

```
REGISTER / LOGIN
─────────────────────────────────────────────────
Client sends { email, password }
        │
        ▼
Server validates input (Zod) → hashes password (bcryptjs)
        │
        ▼
Generates:
  ┌─ Access Token  (JWT, 15min)  ─→ httpOnly cookie
  └─ Refresh Token (JWT, 7 days) ─→ httpOnly cookie + stored in MongoDB
        │
        ▼
{ success: true } ← No tokens in response body


ACCESSING PROTECTED ROUTES
─────────────────────────────────────────────────
Client request (cookie sent automatically)
        │
        ▼
authMiddleware verifies accessToken from cookie
        │
        ▼
req.user = { userId } → handler executes


TOKEN REFRESH (access token expired)
─────────────────────────────────────────────────
Client hits POST /api/auth/refresh
        │
        ▼
Server verifies refreshToken cookie (JWT + DB check)
        │
        ├─ isRevoked: false ✅
        └─ expiresAt > now  ✅
        │
        ▼
New accessToken issued → set as httpOnly cookie


LOGOUT
─────────────────────────────────────────────────
Server marks refresh token as isRevoked: true in DB
Clears both cookies


EMAIL VERIFICATION
─────────────────────────────────────────────────
Register → OTP generated and saved to user document
POST /verify-email { email, otp }
→ OTP verified → isAccountVerified: true
→ Login now allowed


PASSWORD RESET
─────────────────────────────────────────────────
POST /forgot-password { email }
→ OTP generated (10 min expiry)
→ console.log in dev / nodemailer in production
POST /reset-password { email, otp, newPassword }
→ OTP verified → password hashed and updated
```

## Security Highlights

- **httpOnly cookies** — Tokens inaccessible to XSS attacks
- **Server-side revocation** — Refresh tokens tracked in MongoDB with `isRevoked` flag; logout invalidates the session server-side
- **Token rotation** — Every refresh revokes the old token and issues a new pair; sliding session window
- **Reuse detection** — If a revoked token is reused, all user sessions are revoked as a security precaution
- **Rate limiting** — Five dedicated limiters protect login (5/15min), register (10/hour), refresh (20/15min), and password reset (5/30min) endpoints
- **Password security** — bcryptjs hashing (10 rounds), never stored or returned in plaintext
- **Input validation** — Zod schemas enforce format requirements (uppercase, lowercase, numbers, special chars) before any DB query
- **TTL index** — MongoDB auto-deletes expired refresh tokens, no manual cleanup
- **CORS** — Restricted to frontend origin with credentials enabled
- **Helmet** — Security headers (included in dependencies, ready to enable)

## Error Handling

All errors flow through a single centralized handler that distinguishes between:

- **Zod validation errors** — Returns 422 with per-field breakdown of what failed and why
- **JWT errors** — `JsonWebTokenError` and `TokenExpiredError` caught and returned as clean 401 responses
- **Mongoose errors** — Duplicate key (409), validation errors (400), and invalid ObjectId (400) handled explicitly
- **Operational errors** — Thrown via `AppError(message, statusCode)` from any controller, caught and formatted consistently
- **Unexpected errors** — Stack trace exposed only in development, never in production

## Planned Features

- ~~Email verification flow (OTP fields already in user model, nodemailer in deps)~~ ✅
- ~~Forgot / reset password (validation schemas already written)~~ ✅
- verifyAccessToken / verifyRefreshToken utilities
- Wire nodemailer for real OTP email delivery (reserved dependency, OTPs are console-logged in dev for now)
- ~~Env validation at startup (`config/env.js`)~~ ✅
- Test suite (Jest + supertest)

## License

MIT © Abdrahman Walied
