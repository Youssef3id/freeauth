import refreshTokenModel from '../model/refreshToken.js';
import { REFRESH_TOKEN_TTL_MS } from '../utils/constants.js';
import { findValidToken, revokeToken, revokeAllForUser, createToken } from '../repositories/sessionRepository.js';
import { findByIdSafe } from '../repositories/userRepository.js';
import { generateAccessToken, generateRefreshToken } from '../utils/authTokens.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export const createSession = async (userId, refreshToken) => {
    return refreshTokenModel.create({
        userId,
        token: refreshToken,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });
}

export const rotateSession = async (oldToken) => {
    const storedToken = await findValidToken(oldToken);

    if (!storedToken || storedToken.isRevoked) {
        throw new AppError('Invalid or expired refresh token', 401);
    }

    const user = await findByIdSafe(storedToken.userId);

    if (!user) {
        throw new AppError('User not found', 401);
    }

    const revoked = await revokeToken(oldToken);

    if (!revoked) {
        await revokeAllForUser(storedToken.userId);

        logger.warn(`[SECURITY] Refresh token reuse detected for userId: ${storedToken.userId}. All sessions revoked.`);

        throw new AppError('Session invalidated due to suspicious activity, please login again', 401);
    }

    const accessToken = generateAccessToken({ _id: storedToken.userId });
    const refreshToken = generateRefreshToken({ _id: storedToken.userId });

    await createToken(storedToken.userId, refreshToken, new Date(Date.now() + REFRESH_TOKEN_TTL_MS));

    return { accessToken, refreshToken };
}

export const revokeAllSessions = async (userId) => {
    return revokeAllForUser(userId);
}
