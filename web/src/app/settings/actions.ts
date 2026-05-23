"use server";

import { db } from "@/db";
import { outreachSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
  let row = await db.select().from(outreachSettings).get();
  if (!row) {
    await db.insert(outreachSettings).values({}).run();
    row = (await db.select().from(outreachSettings).get())!;
  }
  return {
    wave1Size: row.wave1Size,
    wave2DelayMinutes: row.wave2DelayMinutes,
    wave3DelayMinutes: row.wave3DelayMinutes,
    followUpAfterMinutes: row.followUpAfterMinutes,
    moveOnAfterMinutes: row.moveOnAfterMinutes,
    outreachDay: row.outreachDay,
    outreachHour: row.outreachHour,
  };
}

export async function saveOutreachSettings(settings: OutreachSettings) {
  const existing = await db.select().from(outreachSettings).get();
  if (existing) {
    await db.update(outreachSettings)
      .set({
        wave1Size: settings.wave1Size,
        wave2DelayMinutes: settings.wave2DelayMinutes,
        wave3DelayMinutes: settings.wave3DelayMinutes,
        followUpAfterMinutes: settings.followUpAfterMinutes,
        moveOnAfterMinutes: settings.moveOnAfterMinutes,
        outreachDay: settings.outreachDay,
        outreachHour: settings.outreachHour,
      })
      .where(eq(outreachSettings.id, existing.id))
      .run();
  } else {
    await db.insert(outreachSettings)
      .values({
        wave1Size: settings.wave1Size,
        wave2DelayMinutes: settings.wave2DelayMinutes,
        wave3DelayMinutes: settings.wave3DelayMinutes,
        followUpAfterMinutes: settings.followUpAfterMinutes,
        moveOnAfterMinutes: settings.moveOnAfterMinutes,
        outreachDay: settings.outreachDay,
        outreachHour: settings.outreachHour,
      })
      .run();
  }
  revalidatePath("/settings");
  revalidatePath("/outreach");
}
