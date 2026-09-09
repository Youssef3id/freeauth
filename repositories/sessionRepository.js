import refreshTokenModel from '../model/refreshToken.js';

export const createToken = async (userId, token, expiresAt) => {
    return refreshTokenModel.create({ userId, token, expiresAt });
}

export const findValidToken = async (token) => {
    return refreshTokenModel.findOne({ token, expiresAt: { $gt: new Date() } });
}

export const revokeToken = async (token) => {
    return refreshTokenModel.findOneAndUpdate({ token, isRevoked: false }, { isRevoked: true });
}

export const revokeAllForUser = async (userId) => {
    return refreshTokenModel.updateMany({ userId }, { isRevoked: true });
}
