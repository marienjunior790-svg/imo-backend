import express from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { env, corsOrigins, isLocalUploadEnabled } from './config/env.js';
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

  // Fichiers locaux — dev, ou prod sans Cloudinary (ALLOW_LOCAL_UPLOADS)
  if (isLocalUploadEnabled || env.NODE_ENV !== 'production') {
    app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
  }

  // Page publique : e-mail → HTTPS → deep link mobile (itc://reset-password)
  app.get('/reset-password', (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      res.status(400).type('html').send(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>Lien invalide</title></head>
<body style="font-family:system-ui;padding:2rem;text-align:center"><h1>Lien invalide</h1>
<p>Ce lien de réinitialisation est incorrect ou incomplet.</p></body></html>`);
      return;
    }
    const deepLink = `itc://reset-password?token=${encodeURIComponent(token)}`;
    const appWeb = (env.PUBLIC_APP_URL ?? 'https://app.itc.cg').replace(/\/$/, '');
    const webFallback = `${appWeb}/reset-password?token=${encodeURIComponent(token)}`;
    res
      .status(200)
      .type('html')
      .setHeader('Cache-Control', 'no-store')
      .send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta http-equiv="refresh" content="0;url=${deepLink}"/>
  <title>Réinitialisation ITC</title>
</head>
<body style="font-family:system-ui,Segoe UI,sans-serif;padding:2rem;text-align:center;background:#f8fafc;color:#0f172a">
  <h1 style="font-size:1.25rem">Ouverture d’ITC…</h1>
  <p style="color:#475569;max-width:28rem;margin:1rem auto">Si l’application ne s’ouvre pas, utilisez un des boutons ci-dessous.</p>
  <p style="margin:1.5rem 0">
    <a href="${deepLink}" style="display:inline-block;background:#152238;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Ouvrir l’application</a>
  </p>
  <p><a href="${webFallback}" style="color:#1e3354">Continuer sur le web</a></p>
</body>
</html>`);
  });

  app.use(env.API_PREFIX, routes);

  app.use(errorMiddleware);

  return app;
}
