import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('Missing JWT_SECRET or JWT_REFRESH_SECRET in environment');
}

// Sign access token
export function signJWT(payload: object) {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: '15m',
    issuer: 'cloudvyn.com',
  });
}

// Sign refresh token
export function signRefreshJWT(payload: object) {
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: '7d',
    issuer: 'cloudvyn.com',
  });
}

// Verify access token
export function verifyJWT(token: string) {
  return jwt.verify(token, ACCESS_SECRET, {
    issuer: 'cloudvyn.com',
  });
}

// Verify refresh token
export function verifyRefreshJWT(token: string) {
  return jwt.verify(token, REFRESH_SECRET, {
    issuer: 'cloudvyn.com',
  });
}
