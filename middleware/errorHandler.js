import { env } from '../config/env.js';
import { AppError } from '../src/internal/errors.js';

const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal Server Error";
    let errors = null;

    // Operational application errors (must come first so AppError
    // is never mis-caught by a generic branch below)
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message
        });
    }

    // Zod validation errors
    if (err.name === 'ZodError') {
        statusCode = 422;
        message = "Validation failed";
        const issues = err.issues || err.errors || [];
        errors = issues.map(e => ({
            field: e.path.join('.'),
            message: e.message
        }));
    }

    // JWT errors
    else if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = "Invalid token";
    }
    else if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = "Token expired";
    }

    // Mongoose errors
    else if (err.name === 'ValidationError') {
        statusCode = 400;
        message = "Invalid data";
        errors = Object.values(err.errors).map(e => ({
            field: e.path,
            message: e.message
        }));
    }
    else if (err.code === 11000) {
        statusCode = 409;
        const field = Object.keys(err.keyValue)[0];
        message = `${field} already exists`;
    }
    else if (err.name === 'CastError') {
        statusCode = 400;
        message = `Invalid ${err.path}: ${err.value}`;
    }

    // Log unexpected errors
    if (statusCode === 500 && env.NODE_ENV === 'development') {
        console.error('UNEXPECTED ERROR:', err);
    }

    return res.status(statusCode).json({
        success: false,
        message,
        ...(errors && { errors }),
        ...(env.NODE_ENV === 'development' && statusCode === 500 && {
            stack: err.stack
        })
    });
};

export { AppError };
export default errorHandler;