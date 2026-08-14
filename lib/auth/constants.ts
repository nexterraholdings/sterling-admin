export const SIGN_IN_FAILED_MESSAGE =
  "Sign-in failed. Check your credentials and try again.";

export const SIGN_IN_RATE_LIMIT_MESSAGE =
  "Too many sign-in attempts. Please wait a few minutes and try again.";

export const MFA_REQUIRED_PATH = "/mfa";

/** Failed attempts allowed per IP inside the rolling window. */
export const LOGIN_RATE_LIMIT_IP = 10;

/** Failed attempts allowed per email inside the rolling window. */
export const LOGIN_RATE_LIMIT_EMAIL = 5;

/** Rolling window for login rate limits (minutes). */
export const LOGIN_RATE_LIMIT_WINDOW_MINUTES = 15;

/** How long a remembered device stays signed in / trusted for MFA. */
export const REMEMBER_DEVICE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const REMEMBER_DEVICE_COOKIE = "sterling_remember_device";
export const DEVICE_TRUST_COOKIE = "sterling_device_trust";
