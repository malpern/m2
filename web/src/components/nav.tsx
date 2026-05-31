"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/schedule", label: "Schedule" },
  { href: "/clients", label: "Clients" },
  { href: "/outreach", label: "Outreach" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/schedule") return pathname === "/schedule" || pathname.startsWith("/schedule/");
    if (href === "/clients") return pathname.startsWith("/clients") || pathname.startsWith("/packages") || pathname.startsWith("/reports");
    if (href === "/outreach") return pathname.startsWith("/outreach") || pathname.startsWith("/messages");
    if (href === "/settings") return pathname.startsWith("/settings");
    return pathname === href;
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 mr-8">
          <Image src="/m2logo.png" alt="M2" width={28} height={28} className="rounded-md" />
          <span className="text-sm font-bold tracking-tight hidden sm:inline">M2 Scheduler</span>
        </Link>

        <div className="hidden sm:flex gap-0.5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive(link.href)
                  ? "bg-accent/15 text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/8"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => document.dispatchEvent(new Event("open-search"))}
          className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mr-2"
          aria-label="Search"
        >
          <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <span>Search</span>
          <kbd className="ml-1 inline-flex h-4 items-center rounded border border-border bg-background px-1 text-[10px] font-medium">{"⌘"}K</kbd>
        </button>

        <button
          onClick={() => document.dispatchEvent(new Event("open-search"))}
          className="sm:hidden flex items-center justify-center w-9 h-9 text-muted-foreground hover:text-foreground transition-colors mr-1"
          aria-label="Search"
        >
          <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
        </button>

        <button
          className="sm:hidden flex flex-col justify-center items-center w-9 h-9 gap-1.5"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
        >
          <span className={cn("block h-0.5 w-5 bg-foreground transition-transform", mobileOpen && "translate-y-2 rotate-45")} />
          <span className={cn("block h-0.5 w-5 bg-foreground transition-opacity", mobileOpen && "opacity-0")} />
          <span className={cn("block h-0.5 w-5 bg-foreground transition-transform", mobileOpen && "-translate-y-2 -rotate-45")} />
        </button>
      </div>

      {mobileOpen && (
        <div className="sm:hidden border-t border-border/50 px-4 pb-3 pt-2 space-y-1 bg-background/95 backdrop-blur-xl">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "block rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                isActive(link.href)
                  ? "bg-accent/15 text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/8"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
