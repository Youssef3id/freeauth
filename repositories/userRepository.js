import userModel from '../model/userModel.js';

export const SAFE_PROJECTION = '-password -verifyOTP -verifyOTPExpire -resetOTP -resetOTPExpire -otpAttempts -otpLockUntil';

export const findByEmail = async (email) => {
    return userModel.findOne({ email });
}

export const findByIdSafe = async (id) => {
    return userModel.findById(id).select(SAFE_PROJECTION);
}

export const findByIdWithPassword = async (id) => {
    return userModel.findById(id);
}

export const createUser = async (data) => {
    const { name, email, hashedPassword, verifyOTP, verifyOTPExpire } = data;

    return userModel.create({
        name,
        email,
        password: hashedPassword,
        verifyOTP,
        verifyOTPExpire,
    });
}
