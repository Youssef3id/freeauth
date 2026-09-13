import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL_MS } from '../utils/constants.js';

export const generateAccessToken = (user) => {
    return jwt.sign(
        { userId: user.id },
        env.ACCESS_TOKEN_SECRET,
        { expiresIn: ACCESS_TOKEN_TTL }
    );
}

export const generateRefreshToken = (user) => {
    return jwt.sign(
        { userId: user.id },
        env.REFRESH_TOKEN_SECRET,
        // jsonwebtoken takes seconds for numeric expiresIn
        { expiresIn: REFRESH_TOKEN_TTL_MS / 1000 }
    );
}
