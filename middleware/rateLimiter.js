import rateLimit from "express-rate-limit";

// Global limiter (for all routes)

export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // max 100 requests per IP
    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        message: "Too many requests, please try again later"
    }
});

export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour 
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many accounts created, try again after an hour"
    }
});

export const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many refresh attempts, try again later"
    }
});

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // max 5 login attempts
    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        message: "Too many login attempts, try again after 15 minutes"
    }
});

export const resetPasswordLimiter = rateLimit({
    windowMs: 30 * 60 * 1000, // 0.5 hour
    max: 5, // max 5 password reset attempts
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many password reset attempts, try again after an half hour"
    }
});

export const verifyEmailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // max 5 verification attempts
    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        message: "Too many verification attempts, try again after 15 minutes"
    }
});

export const resendOtpLimiter = rateLimit({
    windowMs: 30 * 60 * 1000, // 0.5 hour
    max: 5, // max 5 OTP resend attempts
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many OTP resend attempts, try again after an half hour"
    }
});