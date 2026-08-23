/**
 * Ganesha backend API configuration.
 *
 * Requests authenticate with a real Entra ID access token from
 * entraAuthService, injected by ganeshaApiClient. Before mobile-entra-auth
 * landed, every request used a hardcoded `dev-token` bearer shortcut
 * (backend/shared/auth.py still accepts that string for local/curl-level
 * testing) -- that shortcut is no longer used by this app itself.
 *
 * GANESHA_PROJECT_ID is hardcoded to the only seeded project
 * (backend/seed_data/seed.py's PROJECT_ID) -- multi-project selection is
 * out of scope for the first field-test round.
 *
 * GANESHA_ORG_ID mirrors the same hardcoded value the web app's
 * `select-role` page uses when creating a new user profile -- the org that
 * owns GANESHA_PROJECT_ID.
 */
export const GANESHA_API_BASE_URL = 'https://ganesha-dev-func.azurewebsites.net/api';
export const GANESHA_PROJECT_ID = 'proj_kariega';
export const GANESHA_ORG_ID = 'org_kariega';
