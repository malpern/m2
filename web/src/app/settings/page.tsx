import { db } from "@/db";
import Link from "next/link";
import { SettingsEditor } from "./settings-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-bold tracking-tight mb-2">Settings</h1>
      <p className="text-muted-foreground text-sm mb-8">Configure how outreach works.</p>
      <SettingsEditor />
    </div>
  );
}
