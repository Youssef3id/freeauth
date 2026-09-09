import { findByEmail, findByIdSafe, findByIdWithPassword, createUser } from '../repositories/userRepository.js';
import { hashPassword, verifyPassword } from './passwordService.js';
import { issueOTP, verifyAndConsumeOTP } from './otpService.js';
import { createSession, rotateSession, revokeAllSessions } from './sessionService.js';
import { revokeToken } from '../repositories/sessionRepository.js';
import { generateAccessToken, generateRefreshToken } from '../utils/authTokens.js';
import { AppError } from '../middleware/errorHandler.js';

export const registerUser = async (data) => {
    const { name, email, password } = data;

    const existingUser = await findByEmail(email);

    if (existingUser) {
        throw new AppError('Email already in use', 409);
    }

    const hashedPassword = await hashPassword(password);

    const { otp, otpExpire, otpHash } = await issueOTP(null, 'verify');

    const user = await createUser({ name, email, hashedPassword, verifyOTP: otpHash, verifyOTPExpire: otpExpire });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await createSession(user._id, refreshToken);

    return { accessToken, refreshToken, otp };
}

export const loginUser = async (data) => {
    const { email, password } = data;

    const user = await findByEmail(email);

    if (!user) {
        throw new AppError('Invalid email or password', 401);
    }

    const isMatch = await verifyPassword(password, user.password);

    if (!isMatch) {
        throw new AppError('Invalid email or password', 401);
    }

    if (!user.isAccountVerified) {
        throw new AppError('Please verify your email before logging in', 403);
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await createSession(user._id, refreshToken);

    return { accessToken, refreshToken };
}

export const verifyEmail = async (data) => {
    const { email, otp } = data;

    const user = await findByEmail(email);

    await verifyAndConsumeOTP(user, otp, 'verify');

    return { verified: true };
}

export const refreshSession = async (oldRefreshToken) => {
    if (!oldRefreshToken) {
        throw new AppError('No refresh token provided', 401);
    }

    return rotateSession(oldRefreshToken);
}

export const forgotPassword = async (data) => {
    const { email } = data;

    const user = await findByEmail(email);

    if (!user) {
        return { sent: false };
    }

    // Generate OTP and save to DB with expiry
    const { otp, otpExpire, otpHash } = await issueOTP(user, 'reset');

    user.resetOTPExpire = otpExpire;
    user.resetOTP = otpHash;

    await user.save();

    return { sent: true, otp };
}

export const resetPassword = async (data) => {
    const { email, otp } = data;
    // newPassword going forward, password kept as deprecated alias
    const password = data.newPassword ?? data.password;

    const user = await findByEmail(email);

    await verifyAndConsumeOTP(user, otp, 'reset');

    // Hash new password and update user record
    const hashedPassword = await hashPassword(password);
    user.password = hashedPassword;
    await user.save();

    await revokeAllSessions(user._id);

    return { reset: true };
}

export const resendOTP = async (data) => {
    const { email } = data;

    const user = await findByEmail(email);

    if (!user) {
        return { sent: false };
    }

    // Account already verified
    if (user.isAccountVerified) {
        throw new AppError('Account is already verified', 400);
    }

    const { otp, otpExpire, otpHash } = await issueOTP(user, 'verify');

    // Save new OTP to DB
    user.verifyOTP = otpHash;
    user.verifyOTPExpire = otpExpire;
    await user.save();

    return { sent: true, otp };
}

export const changePassword = async (userId, data) => {
    const { currentPassword, newPassword } = data;

    const user = await findByIdWithPassword(userId);

    if (!user) {
        throw new AppError('User not found', 404);
    }

    // Verify current password
    const isMatch = await verifyPassword(currentPassword, user.password);

    if (!isMatch) {
        throw new AppError('Current password is incorrect', 401);
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    await revokeAllSessions(userId);

    return { changed: true };
}

export const logoutUser = async (token) => {
    if (!token) {
        return { loggedOut: true };
    }

    await revokeToken(token);

    return { loggedOut: true };
}

export const getMe = async (userId) => {
    const user = await findByIdSafe(userId);

    if (!user) {
        throw new AppError('User not found', 404);
    }

    return user;
}
