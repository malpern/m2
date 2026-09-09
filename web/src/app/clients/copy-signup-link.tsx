"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** The one thing Matt does about consent: hand the client the link. */
export function CopySignupLink({ link, size = "sm" }: { link: string; size?: "sm" | "default" }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button" size={size} variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          window.prompt("Copy this link", link);
        }
      }}
    >
      {copied ? "Copied" : "Copy signup link"}
    </Button>
  );
}
