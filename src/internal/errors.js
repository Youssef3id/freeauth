// Operational application error. Lives in the library (not the Express
// middleware) because core throws it; the reference app's errorHandler
// middleware imports it from here.
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
    }
}

export { AppError };
