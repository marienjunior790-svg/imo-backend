import express from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { env, corsOrigins } from './config/env.js';
import routes from './routes/index.js';
import { errorMiddleware } from './shared/middleware/validate.middleware.js';

export function createApp() {
  const app = express();

  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(helmet());

  const corsOptions: CorsOptions = {
    credentials: true,
    origin:
      env.NODE_ENV === 'production'
        ? corsOrigins?.length
          ? corsOrigins
          : false
        : corsOrigins ?? true,
  };
  app.use(cors(corsOptions));
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // Fichiers locaux (fallback dev sans Cloudinary)
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  app.use(env.API_PREFIX, routes);

  app.use(errorMiddleware);

  return app;
}
