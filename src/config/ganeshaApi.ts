/**
 * Ganesha backend API configuration.
 *
 * GANESHA_API_DEV_TOKEN is the `dev-token` bearer shortcut the backend's
 * shared/auth.py accepts for local/test use -- an MVP stand-in until MSAL
 * sign-in (mobile-entra-auth) replaces it with a real Entra ID access
 * token. Every ganeshaApiClient request authenticates with this until then.
 *
 * GANESHA_PROJECT_ID is hardcoded to the only seeded project
 * (backend/seed_data/seed.py's PROJECT_ID) -- multi-project selection is
 * out of scope for the first field-test round.
 */
export const GANESHA_API_BASE_URL = 'https://ganesha-dev-func.azurewebsites.net/api';
export const GANESHA_API_DEV_TOKEN = 'dev-token';
export const GANESHA_PROJECT_ID = 'proj_kariega';
