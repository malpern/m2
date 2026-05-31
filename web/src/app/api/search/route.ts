import { db } from "@/db";
import { clients, sessions, outreach } from "@/db/schema";
import { eq, like, or, desc } from "drizzle-orm";
import { NextRequest } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";

  if (isRateLimited(ip)) {
    return new Response("Too Many Requests", { status: 429 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2) return Response.json({ results: [] });

  const pattern = `%${query}%`;

  const clientResults = await db.select({
    id: clients.id,
    name: clients.name,
    phone: clients.phone,
    email: clients.email,
    category: clients.category,
  })
  .from(clients)
  .where(or(
    like(clients.name, pattern),
    like(clients.phone, pattern),
    like(clients.email, pattern),
  ))
  .limit(5)
  .all();

  const sessionResults = await db.select({
    id: sessions.id,
    clientId: sessions.clientId,
    clientName: clients.name,
    scheduledDate: sessions.scheduledDate,
    slot: sessions.slot,
    status: sessions.status,
  })
  .from(sessions)
  .innerJoin(clients, eq(clients.id, sessions.clientId))
  .where(or(
    like(clients.name, pattern),
    like(sessions.scheduledDate, pattern),
    like(sessions.slot, pattern),
  ))
  .orderBy(desc(sessions.scheduledDate))
  .limit(5)
  .all();

  const outreachResults = await db.select({
    id: outreach.id,
    clientId: outreach.clientId,
    clientName: clients.name,
    messageText: outreach.messageText,
    direction: outreach.direction,
    status: outreach.status,
    sentAt: outreach.sentAt,
  })
  .from(outreach)
  .innerJoin(clients, eq(clients.id, outreach.clientId))
  .where(or(
    like(clients.name, pattern),
    like(outreach.messageText, pattern),
  ))
  .orderBy(desc(outreach.id))
  .limit(5)
  .all();

  return Response.json({
    results: {
      clients: clientResults.map((c) => ({
        type: "client" as const,
        id: c.id,
        title: c.name,
        subtitle: [c.phone, c.email].filter(Boolean).join(" · "),
        badge: c.category,
        href: `/clients/${c.id}`,
      })),
      sessions: sessionResults.map((s) => {
        const day = new Date(s.scheduledDate + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
        return {
          type: "session" as const,
          id: s.id,
          title: `${s.clientName} — ${day} at ${s.slot}`,
          subtitle: s.status,
          badge: s.status,
          href: `/clients/${s.clientId}`,
        };
      }),
      messages: outreachResults.map((o) => ({
        type: "message" as const,
        id: o.id,
        title: o.clientName,
        subtitle: o.messageText.replace(/\n?\[offered:[^\]]+\]/g, "").slice(0, 80),
        badge: o.direction,
        href: `/clients/${o.clientId}`,
      })),
    },
  });
}
