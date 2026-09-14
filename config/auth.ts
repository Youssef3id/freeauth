import { createAuth } from '../src/core/authService.ts';
import { mongooseAdapter } from '../src/adapters/mongoose.ts';
import { env } from './env.js';

// Composition root: the single place where the adapter and the auth instance are
// constructed. Controllers import `auth` from here, never src/core or src/adapters
// directly. `.ts` specifiers are required because the app runs on Node's native
// type stripping (no build step); tsconfig allows them via allowImportingTsExtensions.
// Secrets come from the app's validated env and are passed explicitly — the
// library never reads environment config itself.
export const auth = createAuth({
    adapter: mongooseAdapter(),
    secrets: {
        accessTokenSecret: env.ACCESS_TOKEN_SECRET,
        refreshTokenSecret: env.REFRESH_TOKEN_SECRET,
    },
});