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
  { href: "/messages", label: "Messages" },
  { href: "/packages", label: "Packages" },
  { href: "/reports", label: "Reports" },
];

export function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 mr-8">
          <Image
            src="/m2logo.png"
            alt="M2"
            width={28}
            height={28}
            className="rounded-md"
          />
          <span className="text-sm font-bold tracking-tight hidden sm:inline">M2 Scheduler</span>
        </Link>

        <div className="hidden sm:flex gap-0.5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pathname === link.href ||
                  (link.href === "/clients" && pathname.startsWith("/clients/")) ||
                  (link.href === "/schedule" && pathname.startsWith("/schedule/")) ||
                  (link.href === "/messages" && pathname.startsWith("/messages/"))
                  ? "bg-accent/15 text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/8"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex-1" />

        <Link
          href="/schedule/priority"
          className="hidden sm:inline-flex text-xs text-muted-foreground hover:text-foreground transition-colors mr-3"
        >
          Priority
        </Link>
        <Link
          href="/schedule/availability"
          className="hidden sm:inline-flex text-xs text-muted-foreground hover:text-foreground transition-colors mr-3"
        >
          Availability
        </Link>
        <Link
          href="/"
          className="hidden sm:inline-flex text-xs text-muted-foreground hover:text-foreground transition-colors mr-3"
        >
          Plan Week
        </Link>

        {/* Mobile hamburger */}
        <button
          className="ml-auto sm:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5"
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
                "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname === link.href ||
                  (link.href === "/clients" && pathname.startsWith("/clients/"))
                  ? "bg-accent/15 text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/8"
              )}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/schedule/priority"
            onClick={() => setMobileOpen(false)}
            className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Priority
          </Link>
          <Link
            href="/schedule/availability"
            onClick={() => setMobileOpen(false)}
            className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Availability
          </Link>
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Plan Week
          </Link>
        </div>
      )}
    </nav>
  );
}
