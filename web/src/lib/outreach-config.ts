export const OUTREACH_DEFAULTS = {
  batchSize: 3,
  followUpAfterMinutes: 60,
  moveOnAfterMinutes: 180,
  outreachDay: "saturday" as const,
  outreachHour: 9,
};

export type OutreachConfig = typeof OUTREACH_DEFAULTS;
