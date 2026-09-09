import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import 'dotenv/config';
import connectDB from './model/mongodb.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { env } from './config/env.js';

// Import router for authentication endpoints (login, register, logout, refresh)
import authRoutes from './routes/authRoutes.js'

import errorHandler from './middleware/errorHandler.js';


const app = express();
const port = env.PORT;

// Middleware setup for JSON parsing, CORS with frontend, and cookie handling
app.use(express.json());
app.use(helmet());
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true               
}));
app.use(cookieParser());

// Register route handlers with rate limiting and API endpoints
app.use(globalLimiter);
app.use('/api/auth', authRoutes);

// 404 JSON handler for unknown routes
app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));

// Global error handling middleware
app.use(errorHandler);

// Establish connection to MongoDB database before starting the server
const startServer = async () => {
    try {
        await connectDB();
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        process.exit(1);
    }

    // Start the Express server on specified port
    app.listen(port, () => {
        console.log(`Running on PORT:${port}`);
    });
};

startServer();