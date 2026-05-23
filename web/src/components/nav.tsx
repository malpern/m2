"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/schedule", label: "Schedule" },
  { href: "/clients", label: "Clients" },
  { href: "/outreach", label: "Outreach" },
  { href: "/packages", label: "Packages" },
  { href: "/reports", label: "Reports" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center px-6">
        <Link href="/" className="text-lg font-bold tracking-tight mr-6">
          Matt Scheduler
        </Link>
        <div className="flex gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pathname === link.href ||
                  (link.href === "/clients" && pathname.startsWith("/clients/"))
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
