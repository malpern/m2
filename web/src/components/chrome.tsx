"use client";

import { usePathname } from "next/navigation";
import { isChromeFree } from "@/lib/chrome-free-paths";

/**
 * Renders the app chrome everywhere except the public legal pages.
 *
 * A client component wrapping server-rendered children: the footer is a server
 * component, so the decision cannot live inside it without converting it.
 */
export function Chrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isChromeFree(pathname)) return null;
  return <>{children}</>;
}
