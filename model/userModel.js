import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: {type: String, required: true},
    email: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    verifyOTP: {type: String, default: null},
    verifyOTPExpire: {type: Number, default: 0},
    isAccountVerified: {type: Boolean, default: false},
    resetOTP: {type: String, default: null},
    resetOTPExpire: {type: Number, default: 0},
    otpAttempts: {type: Number, default: 0},
    otpLockUntil: {type: Date, default: null}
})

const userModel = mongoose.model("user", userSchema);

export default userModel;
