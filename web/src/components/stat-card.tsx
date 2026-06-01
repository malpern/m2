import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

const colors: Record<string, { bg: string; text: string }> = {
  purple: { bg: "from-purple-500/10", text: "" },
  blue: { bg: "from-blue-500/10", text: "text-blue-400" },
  amber: { bg: "from-amber-500/10", text: "text-amber-400" },
  red: { bg: "from-red-500/10", text: "text-red-400" },
  emerald: { bg: "from-emerald-500/10", text: "text-emerald-400" },
};

export function StatCard({
  label,
  count,
  href,
  color,
  suffix,
}: {
  label: string;
  count: number;
  href: string;
  color: string;
  suffix?: string;
}) {
  const c = colors[color] ?? colors.blue;

  return (
    <Link href={href}>
      <Card className="group relative overflow-hidden hover:border-foreground/20 transition-colors cursor-pointer h-full">
        <div className={`absolute inset-0 bg-gradient-to-br ${c.bg} to-transparent`} />
        <CardContent className="relative pt-4 pb-3 text-center">
          <div className={`text-2xl font-bold ${c.text}`}>{count}{suffix ?? ""}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
