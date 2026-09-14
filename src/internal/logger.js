// Reads process.env directly (defaulting to 'development', mirroring the
// reference app's env schema default) instead of importing the app's validated
// env module — the library must not fail at import time on missing app env vars.
const isDevelopment = () => (process.env.NODE_ENV ?? 'development') === 'development';

// Simple logger utility
export const logger = {
    info: (message, data = {}) => {
        console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data);
    },
    warn: (message, data = {}) => {
        console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, data);
    },
    error: (message, error = null) => {
        console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error || '');
    },
    debug: (message, data = {}) => {
        if (isDevelopment()) {
            console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, data);
        }
    }
};