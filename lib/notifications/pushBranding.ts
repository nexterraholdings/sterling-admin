/** Matches Sterling mobile `assets/MobileAppLogo.png` served from the marketing site. */
export const STERLING_NOTIFICATION_LOGO_URL =
  "https://sterlingtheapp.com/brand/MobileAppLogo.png";

export function sterlingBroadcastPushExtras(): {
  richContent: { image: string };
  mutableContent: true;
} {
  return {
    richContent: { image: STERLING_NOTIFICATION_LOGO_URL },
    mutableContent: true,
  };
}
