import { classifyReply } from "./src/lib/classify-reply";

const history = [
  { direction: "sent" as const, text: "Hey Micah, here's your schedule this week:\n• Monday at 3pm\n• Wednesday at 3pm\n• Friday at 3pm\nAll good, or need to change anything?" },
  { direction: "received" as const, text: "Monday sounds great. I can't do that time Wednesday. Could you do 2 p.m.? And let's cancel Friday. I have a conflict." },
  { direction: "sent" as const, text: "cool, got monday locked at 3. wednesday at 2 doesn't work for me, but i can do tuesday or friday at 3 instead—which works better?" },
];
const result = await classifyReply(history, "3pm");
console.log("=== Classifier result for '3pm' ===");
console.log(JSON.stringify(result, null, 2));
