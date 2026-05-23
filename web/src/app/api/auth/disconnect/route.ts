import { disconnect } from "@/lib/google-calendar";

export async function POST() {
  await disconnect();
  return new Response("OK");
}
