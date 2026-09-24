/** Admin-created "prop" accounts (creator_generateProAccount, the Sterling
 * system group owner, etc.) are always given an @sterlingtest.local email so
 * they can be reliably told apart from real users everywhere in the admin
 * dashboard — most importantly, excluded from analytics so seeded content
 * and fake members never get counted as real growth or engagement. */
export const PROP_ACCOUNT_EMAIL_SUFFIX = "@sterlingtest.local";
export const PROP_ACCOUNT_EMAIL_PATTERN = `%${PROP_ACCOUNT_EMAIL_SUFFIX}`;

/** Owns groups created from the admin dashboard. Not a chatter prop account. */
export const SYSTEM_GROUP_OWNER_EMAIL = "sterling-groups@sterlingtest.local";

export function isPropAccountEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(PROP_ACCOUNT_EMAIL_SUFFIX);
}

/** PostgREST `.or()` clause: keep null emails, drop prop accounts.
 * The pattern is quoted so dots in the domain aren't parsed as separators. */
export const EXCLUDE_PROP_ACCOUNT_EMAIL_OR = `email.is.null,email.not.ilike."${PROP_ACCOUNT_EMAIL_PATTERN}"`;
