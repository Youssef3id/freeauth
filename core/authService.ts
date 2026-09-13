// Core auth service, rebuilt against the AuthAdapter contract.
// Source of truth for all shapes and signatures used here: doc/openauth-architecture.md
// This is a translation of services/authService.js — the business logic (password
// hashing, JWT signing, OTP generation/verification, lockout rules, session
// rotation/reuse detection) is unchanged; only the data source changed, from Mongoose
// repositories/models to adapter.* calls. No DB driver or ORM import is allowed here.

import { hashPassword, verifyPassword } from '../services/passwordService.js';
import { issueOTP, hashOTP } from '../services/otpService.js';
import { generateAccessToken, generateRefreshToken } from '../utils/authTokens.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { REFRESH_TOKEN_TTL_MS } from '../utils/constants.js';
import type { AuthAdapter, UserRecord } from './types.js';

const MAX_OTP_ATTEMPTS = 5;
const OTP_LOCKOUT_MS = 15 * 60 * 1000;

export function createAuth(config: { adapter: AuthAdapter }) {
    const { adapter } = config;

    const checkOtpLock = (user: UserRecord, type: 'verify' | 'reset') => {
        const lockUntil = type === 'verify' ? user.verifyLockUntil : user.resetLockUntil;

        if (lockUntil && lockUntil.getTime() > Date.now()) {
            throw new AppError('Too many attempts, try again later', 429);
        }
    };

    // Mirrors otpService registerOtpMismatch. The lockout decision uses the
    // authoritative post-increment count returned by the adapter, not a count
    // guessed from the record fetched at the start of the flow.
    const registerOtpMismatch = async (user: UserRecord, type: 'verify' | 'reset') => {
        const attempts = await adapter.users.incrementOtpAttempts(user.id, type);

        if (attempts >= MAX_OTP_ATTEMPTS) {
            await adapter.users.setOtpLock(user.id, type, new Date(Date.now() + OTP_LOCKOUT_MS));
            await adapter.users.resetOtpAttempts(user.id, type);
        }
    };

    // Translation of otpService verifyAndConsumeOTP, via adapter calls instead of
    // mutating a Mongoose document and calling save().
    const verifyAndConsumeOTP = async (user: UserRecord | null, otp: string, type: 'verify' | 'reset') => {
        if (type === 'reset') {
            if (!user || !user.resetOTP || !user.resetOTPExpire) {
                throw new AppError('Invalid or expired OTP', 400);
            }

            checkOtpLock(user, 'reset');

            if (Date.now() > user.resetOTPExpire) {
                await adapter.users.clearResetOTP(user.id);
                throw new AppError('Invalid or expired OTP', 400);
            }

            if (user.resetOTP !== hashOTP(otp)) {
                await registerOtpMismatch(user, 'reset');
                throw new AppError('Invalid or expired OTP', 400);
            }

            await adapter.users.clearResetOTP(user.id);
            await adapter.users.resetOtpAttempts(user.id, 'reset');

            return true;
        }

        if (!user || !user.verifyOTP || !user.verifyOTPExpire) {
            throw new AppError('Invalid or expired OTP', 400);
        }

        checkOtpLock(user, 'verify');

        if (Date.now() > user.verifyOTPExpire) {
            await adapter.users.clearVerifyOTP(user.id);
            throw new AppError('Invalid or expired OTP', 400);
        }

        if (user.verifyOTP !== hashOTP(otp)) {
            await registerOtpMismatch(user, 'verify');
            throw new AppError('Invalid or expired OTP', 400);
        }

        // Mirror of the reset flow's success path (which clears reset fields alongside
        // the password update): clear the verify fields alongside marking verified.
        await adapter.users.markVerified(user.id);
        await adapter.users.clearVerifyOTP(user.id);
        await adapter.users.resetOtpAttempts(user.id, 'verify');

        return true;
    };

    // Translation of sessionService rotateSession.
    const rotateSession = async (oldToken: string) => {
        const storedToken = await adapter.sessions.findValid(oldToken);

        if (!storedToken || storedToken.isRevoked) {
            throw new AppError('Invalid or expired refresh token', 401);
        }

        const user = await adapter.users.findById(storedToken.userId);

        if (!user) {
            throw new AppError('User not found', 401);
        }

        const revoked = await adapter.sessions.revoke(oldToken);

        if (!revoked) {
            await adapter.sessions.revokeAllForUser(storedToken.userId);

            logger.warn(`[SECURITY] Refresh token reuse detected for userId: ${storedToken.userId}. All sessions revoked.`);

            throw new AppError('Session invalidated due to suspicious activity, please login again', 401);
        }

        const accessToken = generateAccessToken({ id: storedToken.userId });
        const refreshToken = generateRefreshToken({ id: storedToken.userId });

        await adapter.sessions.create({
            userId: storedToken.userId,
            token: refreshToken,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        });

        return { accessToken, refreshToken };
    };

    const registerUser = async (data: { name: string; email: string; password: string }) => {
        const { name, email, password } = data;

        const existingUser = await adapter.users.findByEmail(email);

        if (existingUser) {
            throw new AppError('Email already in use', 409);
        }

        const hashedPassword = await hashPassword(password);

        const { otp, otpExpire, otpHash } = await issueOTP(null, 'verify');

        const user = await adapter.users.create({
            name,
            email,
            password: hashedPassword,
            verifyOTP: otpHash,
            verifyOTPExpire: otpExpire,
        });

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        await adapter.sessions.create({
            userId: user.id,
            token: refreshToken,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        });

        return { accessToken, refreshToken, otp };
    };

    const loginUser = async (data: { email: string; password: string }) => {
        const { email, password } = data;

        const user = await adapter.users.findByEmail(email);

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

        await adapter.sessions.create({
            userId: user.id,
            token: refreshToken,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        });

        return { accessToken, refreshToken };
    };

    const verifyEmail = async (data: { email: string; otp: string }) => {
        const { email, otp } = data;

        const user = await adapter.users.findByEmail(email);

        await verifyAndConsumeOTP(user, otp, 'verify');

        return { verified: true };
    };

    const refreshSession = async (oldRefreshToken: string) => {
        if (!oldRefreshToken) {
            throw new AppError('No refresh token provided', 401);
        }

        return rotateSession(oldRefreshToken);
    };

    const forgotPassword = async (data: { email: string }) => {
        const { email } = data;

        const user = await adapter.users.findByEmail(email);

        if (!user) {
            return { sent: false };
        }

        // Generate OTP and save to DB with expiry
        const { otp, otpExpire, otpHash } = await issueOTP(user, 'reset');

        await adapter.users.setResetOTP(user.id, otpHash, otpExpire);

        return { sent: true, otp };
    };

    const resetPassword = async (data: { email: string; otp: string; newPassword?: string; password?: string }) => {
        const { email, otp } = data;
        // newPassword going forward, password kept as deprecated alias
        const password = data.newPassword ?? data.password;

        const user = await adapter.users.findByEmail(email);

        await verifyAndConsumeOTP(user, otp, 'reset');

        // verifyAndConsumeOTP throws on a null/unknown user, so on return the account exists
        const hashedPassword = await hashPassword(password);
        await adapter.users.updatePassword(user!.id, hashedPassword);

        await adapter.sessions.revokeAllForUser(user!.id);

        return { reset: true };
    };

    const resendOTP = async (data: { email: string }) => {
        const { email } = data;

        const user = await adapter.users.findByEmail(email);

        if (!user) {
            return { sent: false };
        }

        // Account already verified
        if (user.isAccountVerified) {
            throw new AppError('Account is already verified', 400);
        }

        const { otp, otpExpire, otpHash } = await issueOTP(user, 'verify');

        // Save new OTP to DB
        await adapter.users.setVerifyOTP(user.id, otpHash, otpExpire);

        return { sent: true, otp };
    };

    const changePassword = async (userId: string, data: { currentPassword: string; newPassword: string }) => {
        const { currentPassword, newPassword } = data;

        const user = await adapter.users.findById(userId);

        if (!user) {
            throw new AppError('User not found', 404);
        }

        // Verify current password
        const isMatch = await verifyPassword(currentPassword, user.password);

        if (!isMatch) {
            throw new AppError('Current password is incorrect', 401);
        }

        await adapter.users.updatePassword(userId, await hashPassword(newPassword));

        await adapter.sessions.revokeAllForUser(userId);

        return { changed: true };
    };

    const logoutUser = async (token: string) => {
        if (!token) {
            return { loggedOut: true };
        }

        await adapter.sessions.revoke(token);

        return { loggedOut: true };
    };

    const getMe = async (userId: string) => {
        const user = await adapter.users.findById(userId);

        if (!user) {
            throw new AppError('User not found', 404);
        }

        // The adapter returns the full UserRecord (no safe/unsafe projections); core is
        // responsible for never leaking password/OTP hashes to the controller/API layer.
        return {
            id: user.id,
            email: user.email,
            name: user.name,
            isAccountVerified: user.isAccountVerified,
        };
    };

    return {
        registerUser,
        loginUser,
        verifyEmail,
        refreshSession,
        forgotPassword,
        resetPassword,
        resendOTP,
        changePassword,
        logoutUser,
        getMe,
    };
}