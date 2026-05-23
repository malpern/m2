import { getAuthUrl } from "@/lib/google-calendar";
import { redirect } from "next/navigation";

export async function GET() {
  const url = getAuthUrl();
  redirect(url);
}
