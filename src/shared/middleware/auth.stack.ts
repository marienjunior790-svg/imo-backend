import { authMiddleware } from './auth.middleware.js';
import { validateSessionMiddleware } from './session.middleware.js';

/** Chaîne JWT + session — sans password gate (me / change-password / logout / caps). */
export const authenticatedStack = [authMiddleware, validateSessionMiddleware];
