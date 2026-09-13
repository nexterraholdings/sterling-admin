/** Admin-created "prop" accounts (creator_generateProAccount, the Sterling
 * system group owner, etc.) are always given an @sterlingtest.local email so
 * they can be reliably told apart from real users everywhere in the admin
 * dashboard — most importantly, excluded from analytics so seeded content
 * and fake members never get counted as real growth or engagement. */
export const PROP_ACCOUNT_EMAIL_SUFFIX = "@sterlingtest.local";

/** Owns groups created from the admin dashboard. Not a chatter prop account. */
export const SYSTEM_GROUP_OWNER_EMAIL = "sterling-groups@sterlingtest.local";

export function isPropAccountEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(PROP_ACCOUNT_EMAIL_SUFFIX);
}
