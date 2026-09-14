import crypto from 'crypto';
import { OTP_TTL_MS } from './constants.js';

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