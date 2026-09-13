import { createAuth } from '../core/authService.ts';
import { mongooseAdapter } from '../adapters/mongoose.ts';

// Composition root: the single place where the adapter and the auth instance are
// constructed. Controllers import `auth` from here, never core/ or adapters/
// directly. `.ts` specifiers are required because the app runs on Node's native
// type stripping (no build step); tsconfig allows them via allowImportingTsExtensions.
export const auth = createAuth({ adapter: mongooseAdapter() });