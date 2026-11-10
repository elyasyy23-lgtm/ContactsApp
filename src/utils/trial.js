// Pure 7-day trial math (no React, no AsyncStorage) so it can be unit-tested
// from Node in scripts/verify.js.
//
// The trial starts on the very first launch of the app:
//   trialStartedAt = Date.now()  (persisted by PremiumContext)
//   trial ends     = trialStartedAt + 7 days
// A clock set backwards must never reopen the trial, so the caller passes the
// latest timestamp it has ever seen (`Math.max(now, lastSeenAt)`).

export const TRIAL_DAYS = 7;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_MS = TRIAL_DAYS * DAY_MS;

/**
 * trialInfo(startedAt, now) -> {
 *   started, active, expired, msLeft, daysLeft, startedAt, endsAt
 * }
 *
 * daysLeft is rounded UP, so a fresh trial says "7 days" and the last two hours
 * say "1 day" — never "0 days" while the trial is still running.
 */
export function trialInfo(startedAt, now = Date.now()) {
  const start = Number(startedAt) || 0;
  const clock = Number(now) || 0;

  if (!start) {
    return {
      started: false,
      active: false,
      expired: false,
      msLeft: 0,
      daysLeft: 0,
      startedAt: 0,
      endsAt: 0,
    };
  }

  // A clock that jumps into the past between two launches is clamped to the
  // recorded start, so the countdown can never be extended.
  const effectiveNow = Math.max(clock, start);
  const endsAt = start + TRIAL_MS;
  const msLeft = Math.max(0, endsAt - effectiveNow);

  return {
    started: true,
    active: msLeft > 0,
    expired: msLeft <= 0,
    msLeft,
    daysLeft: Math.ceil(msLeft / DAY_MS),
    startedAt: start,
    endsAt,
  };
}
