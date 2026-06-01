import { type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

const COLOR_MAP: Record<string, { bg: string; text: string; iconBg: string }> = {
  purple: { bg: "from-purple-500/10", text: "", iconBg: "bg-purple-500/15" },
  blue: { bg: "from-blue-500/10", text: "text-blue-400", iconBg: "bg-blue-500/15" },
  amber: { bg: "from-amber-500/10", text: "text-amber-400", iconBg: "bg-amber-500/15" },
  red: { bg: "from-red-500/10", text: "text-red-400", iconBg: "bg-red-500/15" },
  emerald: { bg: "from-emerald-500/10", text: "text-emerald-400", iconBg: "bg-emerald-500/15" },
  muted: { bg: "from-muted/30", text: "", iconBg: "bg-muted" },
};

type StatCardProps = {
  label: string;
  count: number;
  color: string;
  /** Optional suffix after count (e.g. "%") */
  suffix?: string;
  /** If provided, the card becomes a link */
  href?: string;
  /** Optional SVG icon rendered inside a rounded square */
  icon?: ReactNode;
};

export function StatCard({ label, count, color, suffix, href, icon }: StatCardProps) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.blue;

  const content = (
    <Card
      className={`relative overflow-hidden ${href ? "group hover:border-foreground/20 transition-colors cursor-pointer" : ""} h-full`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${c.bg} to-transparent`} />
      <CardContent className={`relative ${icon ? "pt-5 pb-4" : "pt-4 pb-3"} ${icon ? "" : "text-center"}`}>
        {icon ? (
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${c.iconBg} flex items-center justify-center`}>
              {icon}
            </div>
            <div>
              <div className={`text-2xl font-bold ${c.text}`}>
                {count}
                {suffix ?? ""}
              </div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          </div>
        ) : (
          <>
            <div className={`text-2xl font-bold ${c.text}`}>
              {count}
              {suffix ?? ""}
            </div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
