import express from 'express';
import requestLogger from './middleware/requestLogger.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';
import session from 'express-session';
import { authRouter } from './routes/authRoutes.js';
import { connectDB } from './config/db.js';
import { configDotenv } from 'dotenv';
import designRouter from './routes/design/design.js';
import buildRouter from './routes/build/buildRoutes.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import upload from './lib/multer.js';

const app = express();

configDotenv();

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://[::1]:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://[::1]:3001',
    'https://deving-plum.vercel.app',
    'https://www.deving-plum.vercel.app',
    'http://deving-plum.vercel.app'
  ],
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static("uploads"));


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


app.post("/upload", upload.array("images"), (req, res) => {
  console.log(req.files);
  res.json({ success: true, message: "Files uploaded successfully", files: req.files });
})


// 404 & error handlers — always last

app.use('/api/auth', authRouter);
app.use('/api/design', designRouter);
app.use('/api/v1/build', buildRouter);
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