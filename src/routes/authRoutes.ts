import axios from "axios";
import express from "express";
import type { Request, Response } from "express";
export const authRouter = express.Router();
import User from "../models/user.model.js";

import dotenv from "dotenv";
dotenv.config();
import { signJWT } from '../lib/jwt.js'

/**
 * Determines the Google OAuth redirect_uri.
 * 
 * CRITICAL: This MUST exactly match the redirect_uri the frontend sends to Google
 * when initiating the OAuth flow (NEXT_PUBLIC_REDIRECT_URL on the frontend).
 * 
 * Priority:
 * 1. GOOGLE_REDIRECT_URI env var (explicit override, highest priority)
 * 2. In production: BACKEND_URL + /api/auth/google/callback  
 *    (Google redirects directly to backend, backend sets cookie then redirects to frontend)
 * 3. In development: BACKEND_URL + /api/auth/google/callback
 */
function getGoogleRedirectUri(): string {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  // Default: Google redirects directly to the backend
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
  return `${backendUrl}/api/auth/google/callback`;
}

authRouter.get("/google/callback", async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string;

    if (!code) {
      console.error("OAuth callback: No code parameter in query string");
      return res.status(400).json({ success: false, message: "No code provided" });
    }

    console.log("OAuth callback: Received code, exchanging with Google...");
    const googleUser = await tokenResponseFromGoogle(code);

    if (!googleUser) {
      return res.status(400).json({ success: false, message: "Failed to get user from Google" });
    }

    console.log("OAuth callback: Got Google user:", googleUser.email);
    const jwt = await findOrCreateUser(googleUser);

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('token', jwt, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const frontendUrl = process.env.FRONTEND_URL || "https://deving-plum.vercel.app";
    console.log("OAuth callback: Setting cookie and redirecting to:", frontendUrl);
    res.redirect(frontendUrl);
  } catch (error) {
    console.error("OAuth error:", error);
    res.status(500).json({ success: false, message: "Internal server error during OAuth" });
  }
});

const tokenResponseFromGoogle = async (code: string) => {
  try {
    const redirectUri = getGoogleRedirectUri();
    console.log("Google token exchange - redirect_uri:", redirectUri);
    console.log("Google token exchange - client_id:", process.env.GCLIENT_CODE?.substring(0, 20) + "...");

    const tokenResponse = await axios.post("https://oauth2.googleapis.com/token", {
      client_id: process.env.GCLIENT_CODE,
      client_secret: process.env.GCLIENT_SECRET,
      code: code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
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
    console.error("Google token error - redirect_uri used:", getGoogleRedirectUri());
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
