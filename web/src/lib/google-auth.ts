import { google, type Auth } from "googleapis";
import { db } from "@/db";
import { googleTokens } from "@/db/schema";
import { eq } from "drizzle-orm";

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/auth/callback`
  );
}

/** Shared core: authenticate, refresh if needed, return client + stored row. */
async function authenticateCore(): Promise<{ oauth2: Auth.OAuth2Client; email: string | null } | null> {
  const stored = await db.select().from(googleTokens).get();
  if (!stored) return null;

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    expiry_date: new Date(stored.expiresAt).getTime(),
  });

  // Refresh if expired
  if (new Date(stored.expiresAt) < new Date()) {
    try {
      const { credentials } = await oauth2.refreshAccessToken();
      await db.update(googleTokens).set({
        accessToken: credentials.access_token!,
        expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600000).toISOString(),
      }).where(eq(googleTokens.id, stored.id)).run();
      oauth2.setCredentials(credentials);
    } catch (e) {
      console.error("Google OAuth token refresh failed:", e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  return { oauth2, email: stored.email };
}

/**
 * Returns an authenticated OAuth2 client with refreshed tokens, or null
 * if no tokens are stored or the refresh fails.
 */
export async function getAuthenticatedClient(): Promise<Auth.OAuth2Client | null> {
  const result = await authenticateCore();
  return result?.oauth2 ?? null;
}

/**
 * Returns the authenticated OAuth2 client plus the stored email address.
 * Used by the email module which needs the sender address.
 */
export async function getAuthenticatedClientWithEmail(): Promise<{ oauth2: Auth.OAuth2Client; email: string | null } | null> {
  return authenticateCore();
}
