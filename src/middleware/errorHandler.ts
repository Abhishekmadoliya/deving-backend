import type { Request, Response, NextFunction } from 'express';
import env from '../config/env.js';

interface AppError extends Error {
  statusCode?: number;
}

const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;

  console.error(`[ERROR] ${err.message}`, {
    stack: env.isProd ? undefined : err.stack,
    path: req.originalUrl,
    method: req.method,
  });

  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal server error',
    ...(env.isProd ? {} : { stack: err.stack }),
  });
};

export default errorHandler;