import crypto from 'crypto';
import { OTP_TTL_MS } from '../utils/constants.js';
import { AppError } from '../middleware/errorHandler.js';

// type is one of 'verify' | 'reset'
export const generateOTP = () => {
    return crypto.randomInt(100000, 1000000).toString();
}

export const hashOTP = (otp) => {
    return crypto.createHash('sha256').update(otp).digest('hex');
}

export const issueOTP = async (user, type) => {
    const otp = generateOTP();
    const otpExpire = Date.now() + OTP_TTL_MS;
    const otpHash = hashOTP(otp);

    return { otp, otpExpire, otpHash };
}

const checkOtpLock = (user) => {
    if (user.otpLockUntil && user.otpLockUntil > Date.now()) {
        throw new AppError('Too many attempts, try again later', 429);
    }
}

const registerOtpMismatch = async (user) => {
    user.otpAttempts += 1;

    if (user.otpAttempts >= 5) {
        user.otpLockUntil = new Date(Date.now() + 15 * 60 * 1000);
        user.otpAttempts = 0;
    }

    await user.save();
}

export const verifyAndConsumeOTP = async (user, otp, type) => {
    if (type === 'reset') {
        if (!user || !user.resetOTP || !user.resetOTPExpire) {
            throw new AppError('Invalid or expired OTP', 400);
        }

        checkOtpLock(user);

        // Check if OTP is expired
        if (Date.now() > user.resetOTPExpire) {
            user.resetOTP = null;
            user.resetOTPExpire = 0;
            await user.save();

            throw new AppError('Invalid or expired OTP', 400);
        }

        // Verify OTP hash
        if (user.resetOTP !== hashOTP(otp)) {
            await registerOtpMismatch(user);
            throw new AppError('Invalid or expired OTP', 400);
        }

        // Clear OTP fields (persisted by the caller's save alongside the new password)

        user.resetOTP = null;
        user.resetOTPExpire = 0;
        user.otpAttempts = 0;
        user.otpLockUntil = null;

        return true;
    }

    if (!user || !user.verifyOTP || !user.verifyOTPExpire) {
        throw new AppError('Invalid or expired OTP', 400);
    }

    checkOtpLock(user);

    // Check expiry
    if (Date.now() > user.verifyOTPExpire) {
        user.verifyOTP = null;
        user.verifyOTPExpire = 0;
        await user.save();

        throw new AppError('Invalid or expired OTP', 400);
    }

    // Verify OTP hash
    if (user.verifyOTP !== hashOTP(otp)) {
        await registerOtpMismatch(user);
        throw new AppError('Invalid or expired OTP', 400);
    }

    // Mark account as verified

    user.isAccountVerified = true;
    user.verifyOTP = null;
    user.verifyOTPExpire = 0;
    user.otpAttempts = 0;
    user.otpLockUntil = null;
    await user.save();

    return true;
}
