import express from 'express';
import { validate } from '../middleware/validate.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, verifyEmailSchema, resendOTPSchema, changePasswordSchema } from '../controllers/auth/authValidation.js'; 
import {
    getApiStatus,
    registerUser,
    loginUser,
    logoutUser,
    refreshTokenController,
    getMe,
    forgotPassword,
    resetPassword,
    verifyEmail,
    resendOTP,
    changePassword
} from '../controllers/auth/authController.js'; 
import { 
    authLimiter,
    registerLimiter,
    refreshLimiter,
    resetPasswordLimiter,
    verifyEmailLimiter,
    resendOtpLimiter,
} from '../middleware/rateLimiter.js';

const router = express.Router();

router.get('/', getApiStatus);
router.post('/register', registerLimiter, validate(registerSchema), registerUser);
router.post('/login', authLimiter, validate(loginSchema), loginUser);
router.post('/logout', logoutUser);
router.post('/refresh', refreshLimiter, refreshTokenController);
router.get('/me', authMiddleware, getMe);
router.post('/forgot-password', resetPasswordLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', resetPasswordLimiter, validate(resetPasswordSchema), resetPassword);
router.post('/verify-email', verifyEmailLimiter, validate(verifyEmailSchema), verifyEmail);
router.post('/resend-otp', resendOtpLimiter, validate(resendOTPSchema), resendOTP);
router.post('/change-password', authMiddleware, validate(changePasswordSchema), changePassword);

export default router;