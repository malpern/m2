"use server";

import { revalidatePath } from "next/cache";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "outreach-settings.json");

export type OutreachSettings = {
  wave1Size: number;
  wave2DelayMinutes: number;
  wave3DelayMinutes: number;
  followUpAfterMinutes: number;
  moveOnAfterMinutes: number;
  outreachDay: string;
  outreachHour: number;
};

const DEFAULTS: OutreachSettings = {
  wave1Size: 8,
  wave2DelayMinutes: 45,
  wave3DelayMinutes: 120,
  followUpAfterMinutes: 60,
  moveOnAfterMinutes: 180,
  outreachDay: "saturday",
  outreachHour: 9,
};

export async function getOutreachSettings(): Promise<OutreachSettings> {
  if (existsSync(CONFIG_PATH)) {
    try {
      return { ...DEFAULTS, ...JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) };
    } catch {
      return DEFAULTS;
    }
  }
  return DEFAULTS;
}

export async function saveOutreachSettings(settings: OutreachSettings) {
  writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2));
  revalidatePath("/settings");
  revalidatePath("/outreach");
}
