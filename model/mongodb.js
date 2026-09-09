import mongoose from "mongoose";
import { env } from "../config/env.js";

const connectDB = async () => {
    try {
        await mongoose.connect(env.MONGODB_URL, {

        })
        console.log("Connected to MongoDB");
        
    }
    catch (error) {
        console.error("Error connecting to MongoDB:", error);
        throw error;
    }
}

export default connectDB;