import type { Request, Response, NextFunction } from 'express';
import fs from 'fs';


const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    // write to a log file or external logging service here if needed
    fs.appendFileSync('request.log', `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms\n`);
  });
  next();
};

export default requestLogger;