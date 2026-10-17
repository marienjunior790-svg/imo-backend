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
// Valeurs factices : aucun appel réel à Stripe n'est fait pendant les tests (client remplacé).
process.env.STRIPE_SECRET_KEY = 'sk_test_itc_fake_key_for_tests';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_itc_fake_secret_for_tests';
process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_test_pro_monthly';
process.env.STRIPE_PRICE_PRO_ANNUAL = 'price_test_pro_annual';
process.env.STRIPE_PRICE_PLUS_MONTHLY = 'price_test_plus_monthly';
process.env.STRIPE_PRICE_PLUS_ANNUAL = 'price_test_plus_annual';
process.env.STRIPE_PRICE_PRO_MAX_MONTHLY = 'price_test_pro_max_monthly';
process.env.STRIPE_PRICE_PRO_MAX_ANNUAL = 'price_test_pro_max_annual';
process.env.SUBSCRIPTION_ALERTS_SCHEDULER = 'off';
process.env.INTELLIGENCE_MATCHING_ENABLED = 'true';
process.env.INTELLIGENCE_MARKET_STATS_MIN_SAMPLE = '5';
