import 'dotenv/config';
import app from './app.js';
import env from './config/env.js';

const server = app.listen(env.PORT, () => {
  console.log(`[${env.NODE_ENV}] Server running at http://localhost:${env.PORT}`);
});

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });

  // Force exit if server doesn't close in 10s
  setTimeout(() => {
    console.error('Forcing shutdown.');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  shutdown('uncaughtException');
});