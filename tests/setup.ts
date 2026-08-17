/**
 * Variables d'environnement pour la suite de tests Jest.
 * Chargé avant tout import applicatif.
 */
import 'reflect-metadata';
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.API_PREFIX = '/api/v1';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://immotec:immotec_dev@localhost:5432/immo_tec_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-jwt-access-secret-key-32chars!!';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-32chars!';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.N8N_ENABLED = 'false';
process.env.N8N_API_KEY = 'immo-tec-automation-key-32chars-min';
process.env.DEFAULT_CURRENCY = 'XAF';
process.env.DEFAULT_CITY = 'Brazzaville';
process.env.DEFAULT_COUNTRY = 'CG';
process.env.ALLOW_LOCAL_UPLOADS = process.env.ALLOW_LOCAL_UPLOADS ?? 'true';
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL ?? 'http://localhost:3001';
