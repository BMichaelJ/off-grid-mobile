/**
 * Microsoft Entra ID (Azure AD) configuration for native mobile sign-in.
 *
 * Both app registrations already exist (created outside this codebase, via
 * `az ad app create` in a prior session) -- this file only records the IDs
 * needed to talk to them, it does not create or manage them.
 *
 * - `ganesha-api` (ENTRA_API_APP_ID below) is the backend's own app
 *   registration; it exposes the `access_as_user` delegated scope that
 *   backend/shared/auth.py's `_validate_entra_token` requires.
 * - `ganesha-mobile-android` (ENTRA_MOBILE_CLIENT_ID below) is this app's
 *   public client registration. Its redirect URIs include both the
 *   MSAL-broker-style URI computed for a (never-built) official MSAL SDK
 *   integration, and the plain custom-scheme URI actually used by
 *   react-native-app-auth (ENTRA_REDIRECT_URL) -- see services/entraAuthService.
 */

export const ENTRA_TENANT_ID = '9f5c18dd-4abd-4ca9-8af7-e0788a6e4190';
export const ENTRA_ISSUER = `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/v2.0`;

export const ENTRA_MOBILE_CLIENT_ID = '5913987b-a220-48a8-aca3-fcc2de3da6be';
export const ENTRA_API_APP_ID = 'c390d45d-01dd-4a95-aaf6-7aa6d04d8f91';

/**
 * Must exactly match: the `org.ganesha.elebook://oauthredirect` public client
 * redirect URI registered on `ganesha-mobile-android`, AND the
 * `appAuthRedirectScheme` manifestPlaceholder in android/app/build.gradle
 * (which is package-suffix-independent -- covers both the debug `.dev` and
 * release builds with this one value).
 */
export const ENTRA_REDIRECT_URL = 'org.ganesha.elebook://oauthredirect';

/**
 * `offline_access` is requested explicitly (not implied by default for a
 * native/public client) so Entra actually issues a refresh token -- without
 * it, `authorize()` still succeeds but `getValidAccessToken()` would have no
 * way to renew the session once the short-lived access token expires.
 */
export const ENTRA_SCOPES = ['openid', 'profile', 'offline_access', `api://${ENTRA_API_APP_ID}/access_as_user`];
