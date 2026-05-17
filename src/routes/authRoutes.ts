import axios from "axios";
import express from "express";
import type { Request, Response } from "express";
export const authRouter = express.Router();
import {signJWT} from '../lib/jwt.js'
import User from "../models/user.model.js";


authRouter.get("/google/callback", async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string;

    if (!code) {
      return res.status(400).json({ success: false, message: "No code provided" });
    }

    const googleUser = await tokenResponseFromGoogle(code);
    
    if (!googleUser) {
      return res.status(400).json({ success: false, message: "Failed to get user from Google" });
    }

    const jwt = await findOrCreateUser(googleUser);

    res.cookie('token', jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect("http://localhost:3000");
  } catch (error) {
    console.error("OAuth error:", error);
    res.status(500).json({ success: false, message: "Internal server error during OAuth" });
  }
});

const tokenResponseFromGoogle = async (code: string) => {
  try {
    const tokenResponse = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: process.env.GCLIENT_CODE,
      client_secret: process.env.GCLIENT_SECRET,
      code: code,
      grant_type: "authorization_code",
      redirect_uri: "http://localhost:8000/api/auth/google/callback",
    });

    const accessToken = tokenResponse.data.access_token;

    const userResponse = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    return userResponse.data;
  } catch (error: any) {
    console.error("Google token error:", error.response?.data || error.message);
    return null;
  }
};

async function findOrCreateUser(googleUser: any) {
  const user = await User.findOneAndUpdate(
    { providerId: googleUser.id },
    {
      email: googleUser.email,
      name: googleUser.name,
      avatar: googleUser.picture,
      provider: "google",
      lastLogin: new Date(),
    },
    { upsert: true, new: true },
  );

  const jwt = signJWT({
    sub: user._id.toString(),
    email: user.email,
  });

  return jwt;
}
