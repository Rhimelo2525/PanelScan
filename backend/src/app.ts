import cors from 'cors';
import express, { type Application, type Request, type Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env';
import { globalErrorHandler } from './middleware/error.middleware';
import { notFound } from './middleware/notFound.middleware';
import routes from './routes';

const app: Application = express();

// Security & parsing middleware
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// PayMongo webhook signature verification needs the exact raw request body,
// so this one route gets raw-body parsing registered BEFORE the global JSON
// parser below (Express applies app.use() middleware in registration order,
// scoped to matching paths) - every other route is unaffected.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api', routes);

// 404 + global error handling (must be registered last)
app.use(notFound);
app.use(globalErrorHandler);

export default app;
