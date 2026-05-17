// src/config/db.ts

import mongoose from "mongoose";

export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);

    console.log("MongoDB Connected");
  } catch (error) {
    console.log("DB Connection Error:", error);

    process.exit(1);
  }
}