import jwt from 'jsonwebtoken';
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL_MS } from './constants.js';

// Secrets are passed in by the caller (core threads them through from
// createAuth's `secrets` config) — this module never reads environment
// config itself, so the library has no import-time env requirements.
export const generateAccessToken = (user, accessTokenSecret) => {
    return jwt.sign(
        { userId: user.id },
        accessTokenSecret,
        { expiresIn: ACCESS_TOKEN_TTL }
    );
}

export const generateRefreshToken = (user, refreshTokenSecret) => {
    return jwt.sign(
        { userId: user.id },
        refreshTokenSecret,
        // jsonwebtoken takes seconds for numeric expiresIn
        { expiresIn: REFRESH_TOKEN_TTL_MS / 1000 }
    );
}
