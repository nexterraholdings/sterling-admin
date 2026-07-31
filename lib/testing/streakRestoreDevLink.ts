/** Dev deep links for SterlingMobile streak-restore UI preview (__DEV__ builds only). */

export type StreakRestoreDevLinkParams = {
  brokenStreak?: number;
  plan?: string;
  freeRestoresRemaining?: number;
  forcePaidRestore?: boolean;
};

export type StreakRestoreDevScenario = {
  id: string;
  label: string;
  description: string;
  params: StreakRestoreDevLinkParams;
};

export const STREAK_RESTORE_DEV_SCENARIOS: StreakRestoreDevScenario[] = [
  {
    id: 'free-upgrade',
    label: 'Free user',
    description: 'Shows Sterling Plus upgrade CTA (no membership allowance).',
    params: { plan: 'free', freeRestoresRemaining: 0 },
  },
  {
    id: 'plus-allowance',
    label: 'Sterling Plus · 2 left',
    description: 'Member can use a free weekly restore.',
    params: { plan: 'sterling_plus', freeRestoresRemaining: 2 },
  },
  {
    id: 'plus-limit',
    label: 'Sterling Plus · limit hit',
    description: 'Weekly allowance used; paid IAP flag is off in production builds.',
    params: { plan: 'sterling_plus', freeRestoresRemaining: 0 },
  },
  {
    id: 'premium',
    label: 'Sterling Premium',
    description: 'Unlimited included restores copy.',
    params: { plan: 'sterling_premium', freeRestoresRemaining: 99 },
  },
  {
    id: 'paid-cta',
    label: 'Paid restore CTA (UI only)',
    description: 'Forces the $1.99 button layout even before IAP ships.',
    params: { plan: 'free', freeRestoresRemaining: 0, forcePaidRestore: true },
  },
];

export function buildStreakRestoreDevLink(
  params: StreakRestoreDevLinkParams = {},
  brokenStreak = 7,
): string {
  const search = new URLSearchParams();
  search.set('broken', String(Math.max(1, Math.min(30, Math.floor(brokenStreak)))));
  if (params.plan) search.set('plan', params.plan);
  if (params.freeRestoresRemaining != null) {
    search.set('freeRemaining', String(params.freeRestoresRemaining));
  }
  if (params.forcePaidRestore) search.set('paid', '1');
  return `shmobile://dev/streak-restore?${search.toString()}`;
}
