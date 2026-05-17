// src/models/user.model.ts

import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  avatar: string;
  provider: string;
  lastLogin: Date;
  providerId: string;
}

const userSchema = new Schema<IUser>(
  {
    providerId:{
      type:String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: false,
    },
    avatar: {
      type: String,
      required: false,
    },
    provider:{
      type: String,
      required: false,
    },
    lastLogin:{
      type: Date,
      required: false,
    }
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model<IUser>("User", userSchema);

export default User;