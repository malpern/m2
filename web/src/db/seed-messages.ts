import { db } from "./index";
import { outreach, clients } from "./schema";

function getMonday(weeksAgo: number): Date {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - weeksAgo * 7);
  return monday;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function isoTimestamp(d: Date, hour: number, minute: number): string {
  const ts = new Date(d);
  ts.setHours(hour, minute, 0, 0);
  return ts.toISOString();
}

interface MessageTemplate {
  direction: "sent" | "received";
  messageText: string;
  interpretation: "confirmed" | "declined" | "ambiguous" | "reschedule_request" | null;
  status: "pending" | "awaiting_reply" | "confirmed" | "needs_matt" | "expired";
  hourOffset: number; // hours after Monday 9am for the week
  minuteOffset: number;
}

interface ConversationThread {
  messages: MessageTemplate[];
}

// Realistic conversation threads that can be assigned to different clients
const threadTemplates: ConversationThread[] = [
  // Thread type: quick confirm
  {
    messages: [
      { direction: "sent", messageText: "Hey {name}, you free {day} at {time}?", interpretation: null, status: "awaiting_reply", hourOffset: 0, minuteOffset: 0 },
      { direction: "received", messageText: "Yeah see you then", interpretation: "confirmed", status: "confirmed", hourOffset: 2, minuteOffset: 15 },
    ],
  },
  // Thread type: decline
  {
    messages: [
      { direction: "sent", messageText: "Hey {name}, want to hit {day} at {time}?", interpretation: null, status: "awaiting_reply", hourOffset: 0, minuteOffset: 0 },
      { direction: "received", messageText: "Can't make it this week, got a game", interpretation: "declined", status: "expired", hourOffset: 1, minuteOffset: 45 },
    ],
  },
  // Thread type: reschedule
  {
    messages: [
      { direction: "sent", messageText: "Hey {name}, we still on for {day} at {time}?", interpretation: null, status: "awaiting_reply", hourOffset: 0, minuteOffset: 0 },
      { direction: "received", messageText: "Can we do 5 instead?", interpretation: "reschedule_request", status: "needs_matt", hourOffset: 3, minuteOffset: 30 },
      { direction: "sent", messageText: "5 works, see you then", interpretation: null, status: "confirmed", hourOffset: 3, minuteOffset: 55 },
      { direction: "received", messageText: "Sounds good", interpretation: "confirmed", status: "confirmed", hourOffset: 4, minuteOffset: 10 },
    ],
  },
  // Thread type: ambiguous then follow-up
  {
    messages: [
      { direction: "sent", messageText: "{name} - session {day} at {time}?", interpretation: null, status: "awaiting_reply", hourOffset: 0, minuteOffset: 0 },
      { direction: "received", messageText: "Let me check and get back to you", interpretation: "ambiguous", status: "awaiting_reply", hourOffset: 1, minuteOffset: 20 },
      { direction: "sent", messageText: "Hey just checking in on {day}", interpretation: null, status: "awaiting_reply", hourOffset: 24, minuteOffset: 0 },
      { direction: "received", messageText: "Yeah I'm good, see you there", interpretation: "confirmed", status: "confirmed", hourOffset: 25, minuteOffset: 30 },
    ],
  },
  // Thread type: post-session casual
  {
    messages: [
      { direction: "sent", messageText: "Great session today {name}, see you next week", interpretation: null, status: "confirmed", hourOffset: 48, minuteOffset: 0 },
      { direction: "received", messageText: "Thanks man! Felt really good today", interpretation: null, status: "confirmed", hourOffset: 48, minuteOffset: 15 },
    ],
  },
  // Thread type: standing slot confirm
  {
    messages: [
      { direction: "sent", messageText: "Hey {name}, same time this week - {day} {time}?", interpretation: null, status: "awaiting_reply", hourOffset: 0, minuteOffset: 0 },
      { direction: "received", messageText: "Yep!", interpretation: "confirmed", status: "confirmed", hourOffset: 0, minuteOffset: 35 },
    ],
  },
  // Thread type: no reply (expired)
  {
    messages: [
      { direction: "sent", messageText: "Hey {name}, want to get one in this week? {day} at {time}?", interpretation: null, status: "expired", hourOffset: 0, minuteOffset: 0 },
    ],
  },
  // Thread type: long reschedule chain
  {
    messages: [
      { direction: "sent", messageText: "{name} - you free {day} at {time}?", interpretation: null, status: "awaiting_reply", hourOffset: 0, minuteOffset: 0 },
      { direction: "received", messageText: "That doesn't work, what about Friday?", interpretation: "reschedule_request", status: "needs_matt", hourOffset: 4, minuteOffset: 0 },
      { direction: "sent", messageText: "Friday at 5 work?", interpretation: null, status: "awaiting_reply", hourOffset: 4, minuteOffset: 30 },
      { direction: "received", messageText: "Perfect", interpretation: "confirmed", status: "confirmed", hourOffset: 5, minuteOffset: 0 },
    ],
  },
  // Thread type: decline with reason
  {
    messages: [
      { direction: "sent", messageText: "Hey {name}, {day} at {time} this week?", interpretation: null, status: "awaiting_reply", hourOffset: 0, minuteOffset: 0 },
      { direction: "received", messageText: "Nah I'm out of town this week. Back next Monday", interpretation: "declined", status: "expired", hourOffset: 6, minuteOffset: 0 },
      { direction: "sent", messageText: "No worries, hit me up when you're back", interpretation: null, status: "expired", hourOffset: 6, minuteOffset: 15 },
    ],
  },
  // Thread type: enthusiastic confirm
  {
    messages: [
      { direction: "sent", messageText: "{name}, got a spot {day} at {time}. Want it?", interpretation: null, status: "awaiting_reply", hourOffset: 0, minuteOffset: 0 },
      { direction: "received", messageText: "Yes!! Been waiting all week. See you there", interpretation: "confirmed", status: "confirmed", hourOffset: 0, minuteOffset: 12 },
    ],
  },
  // Thread type: parent confirms
  {
    messages: [
      { direction: "sent", messageText: "Hi, checking if {name} can make {day} at {time} this week?", interpretation: null, status: "awaiting_reply", hourOffset: 0, minuteOffset: 0 },
      { direction: "received", messageText: "Hi Matt, yes he'll be there. Thanks!", interpretation: "confirmed", status: "confirmed", hourOffset: 2, minuteOffset: 0 },
    ],
  },
  // Thread type: follow-up after missed
  {
    messages: [
      { direction: "sent", messageText: "Hey {name}, missed you yesterday. Everything ok?", interpretation: null, status: "awaiting_reply", hourOffset: 24, minuteOffset: 0 },
      { direction: "received", messageText: "Sorry, totally forgot. Can we make it up?", interpretation: "reschedule_request", status: "needs_matt", hourOffset: 26, minuteOffset: 0 },
      { direction: "sent", messageText: "No sweat. How about {day} at {time}?", interpretation: null, status: "awaiting_reply", hourOffset: 26, minuteOffset: 20 },
      { direction: "received", messageText: "Done", interpretation: "confirmed", status: "confirmed", hourOffset: 27, minuteOffset: 0 },
    ],
  },
  // Thread type: weather cancellation
  {
    messages: [
      { direction: "sent", messageText: "Heads up {name}, might have to move indoors {day} if the rain keeps up. Still planning on {time}", interpretation: null, status: "awaiting_reply", hourOffset: 0, minuteOffset: 0 },
      { direction: "received", messageText: "That's fine, I'll be there rain or shine", interpretation: "confirmed", status: "confirmed", hourOffset: 1, minuteOffset: 0 },
    ],
  },
  // Thread type: quick check-in
  {
    messages: [
      { direction: "sent", messageText: "Good work this week {name}. Getting better every session", interpretation: null, status: "confirmed", hourOffset: 72, minuteOffset: 0 },
      { direction: "received", messageText: "Thanks coach! My swing is feeling way better", interpretation: null, status: "confirmed", hourOffset: 72, minuteOffset: 30 },
    ],
  },
];

interface ClientConvoConfig {
  name: string;
  days: string[];
  times: string[];
  threadCount: number; // how many threads across 8 weeks
}

const clientConfigs: ClientConvoConfig[] = [
  { name: "Reggie Jackson", days: ["Monday", "Wednesday"], times: ["3pm", "3pm"], threadCount: 8 },
  { name: "Johnny Bench", days: ["Tuesday", "Thursday"], times: ["3pm", "3pm"], threadCount: 7 },
  { name: "Pete Rose", days: ["Tuesday"], times: ["5pm"], threadCount: 5 },
  { name: "Nolan Ryan", days: ["Monday", "Friday"], times: ["5pm", "5pm"], threadCount: 6 },
  { name: "Rod Carew", days: ["Monday", "Thursday"], times: ["6pm", "5pm"], threadCount: 6 },
  { name: "Tom Seaver", days: ["Wednesday", "Friday"], times: ["5pm", "6pm"], threadCount: 5 },
  { name: "Thurman Munson", days: ["Wednesday"], times: ["6pm"], threadCount: 4 },
  { name: "Micah Alpern", days: ["Monday", "Wednesday", "Friday"], times: ["12pm", "12pm", "1:15pm"], threadCount: 7 },
];

async function seedMessages() {
  const allClients = await db.select().from(clients).all();
  let totalInserted = 0;

  for (const config of clientConfigs) {
    const client = allClients.find((c) => c.name === config.name);
    if (!client) {
      console.log(`Client not found: ${config.name}, skipping`);
      continue;
    }

    const firstName = config.name.split(" ")[0];

    // Spread threads across 8 weeks
    const weeksToUse: number[] = [];
    for (let i = 0; i < config.threadCount; i++) {
      weeksToUse.push(8 - Math.floor((i * 8) / config.threadCount));
    }

    for (let i = 0; i < config.threadCount; i++) {
      const weeksAgo = weeksToUse[i];
      const monday = getMonday(weeksAgo);
      const weekOfStr = formatDate(monday);

      // Pick a thread template, cycling through them
      const template = threadTemplates[i % threadTemplates.length];

      // Pick a day/time for this thread
      const dayIdx = i % config.days.length;
      const day = config.days[dayIdx];
      const time = config.times[dayIdx];

      for (const msg of template.messages) {
        // Replace placeholders in message text
        const text = msg.messageText
          .replace("{name}", firstName)
          .replace("{day}", day)
          .replace("{time}", time);

        // Calculate timestamp
        const baseHour = 9; // 9am start
        const ts = isoTimestamp(monday, baseHour + Math.floor(msg.hourOffset), msg.minuteOffset + (msg.hourOffset % 1) * 60);

        await db.insert(outreach)
          .values({
            clientId: client.id,
            weekOf: weekOfStr,
            direction: msg.direction,
            messageText: text,
            interpretation: msg.interpretation,
            status: msg.status,
            sentAt: msg.direction === "sent" ? ts : null,
            repliedAt: msg.direction === "received" ? ts : null,
          })
          .run();

        totalInserted++;
      }
    }
  }

  console.log(`Seeded ${totalInserted} messages across ${clientConfigs.length} clients over 8 weeks.`);
}

seedMessages();
