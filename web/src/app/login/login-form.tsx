"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    setShaking(false);
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      setSuccess(true);
      setTimeout(() => {
        router.push(redirect);
        router.refresh();
      }, 800);
    } else {
      setShaking(true);
      setError(true);
      setLoading(false);
      setTimeout(() => setShaking(false), 600);
    }
  };

  return (
    <>
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15%, 45%, 75% { transform: translateX(-8px); }
          30%, 60%, 90% { transform: translateX(8px); }
        }
        @keyframes success-scale {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.04); }
          100% { transform: scale(1); opacity: 0.9; }
        }
        @keyframes fade-up {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .shake { animation: shake 0.5s ease-in-out; }
        .success-pulse { animation: success-scale 0.6s ease-out; }
        .fade-up { animation: fade-up 0.4s ease-out; }
      `}</style>
      <form
        onSubmit={handleSubmit}
        className={`space-y-4 transition-all duration-500 ${success ? "success-pulse" : ""}`}
      >
        <div className={shaking ? "shake" : ""}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(false); }}
            autoFocus
            disabled={success}
            className={`w-full h-11 rounded-lg border bg-background/50 backdrop-blur-sm px-4 text-center text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 transition-all duration-300 ${
              error
                ? "border-red-500/50 focus:ring-red-500/30 focus:border-red-500/50"
                : success
                  ? "border-emerald-500/50 focus:ring-emerald-500/30"
                  : "border-border/50 focus:ring-accent/50 focus:border-accent/50"
            }`}
          />
        </div>
        {error && (
          <p className="text-sm text-red-400 text-center fade-up">Wrong password</p>
        )}
        {success && (
          <div className="flex items-center justify-center gap-2 fade-up">
            <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-sm text-emerald-400 font-medium">Welcome back</span>
          </div>
        )}
        {!success && (
          <Button type="submit" className="w-full h-11 rounded-lg text-sm font-semibold" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        )}
      </form>
    </>
  );
}
