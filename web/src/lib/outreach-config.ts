export const OUTREACH_DEFAULTS = {
  wave1Size: 8,
  wave2DelayMinutes: 45,
  wave3DelayMinutes: 120,
  followUpAfterMinutes: 60,
  moveOnAfterMinutes: 180,
  outreachDay: "saturday" as const,
  outreachHour: 9,
};

export type OutreachConfig = typeof OUTREACH_DEFAULTS;
