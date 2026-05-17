import express from 'express';
import requestLogger from './middleware/requestLogger.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';
import session from 'express-session';
import { authRouter } from './routes/authRoutes.js';
import { connectDB } from './config/db.js';
import { configDotenv } from 'dotenv';
import designRouter from './routes/design/design.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const app = express();

configDotenv();

// CORS configuration
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

connectDB()
// Request logging
app.use(requestLogger);

declare module "express-session" {
  interface SessionData {
    user?: {
      id: string;
      name: string;
    };
  }
}

app.get('/', (_, res) => {
  res.json({ success: true, message: 'Welcome to the Devign API!' });
});
// Health check
app.get('/health', (_, res) => {
  res.json({ success: true, uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// app.use('v1')

// ---- Register your routes here ----
// app.use('/api/users', userRouter);

// 404 & error handlers — always last

app.use('/api/auth', authRouter);
app.use('/api/design', designRouter);
// session
app.use(
  session({
    secret: "mySuperSecretKey",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60,
      httpOnly: true,
      secure: false,
    },
  })
);

app.use(notFound);
app.use(errorHandler);

export default app;