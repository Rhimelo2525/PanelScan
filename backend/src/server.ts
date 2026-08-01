import app from './app';
import { prisma } from './config/database';
import { env } from './config/env';

const server = app.listen(env.PORT, () => {
  console.log(`🚀 PanelScan API running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

const shutdown = (signal: string): void => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason: unknown) => {
  console.error('💥 UNHANDLED REJECTION! Shutting down...', reason);
  server.close(() => process.exit(1));
});
