// lib/jwt.js
import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

// Sign access token
export function signJWT(payload) {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: '15m',
    issuer: 'cloudvyn.com',
  });
}

// Sign refresh token
export function signRefreshJWT(payload) {
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: '7d',
    issuer: 'cloudvyn.com',
  });
}

// Verify access token
export function verifyJWT(token) {
  return jwt.verify(token, ACCESS_SECRET, {
    issuer: 'cloudvyn.com',
  });
  // Returns payload if valid, throws if expired or invalid
}

// Verify refresh token
export function verifyRefreshJWT(token) {
  return jwt.verify(token, REFRESH_SECRET, {
    issuer: 'cloudvyn.com',
  });
}