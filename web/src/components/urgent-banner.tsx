import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

const bannerColors: Record<string, { border: string; borderHover: string; dot: string }> = {
  purple: { border: "border-purple-500/30", borderHover: "hover:border-purple-500/50", dot: "bg-purple-500" },
  emerald: { border: "border-emerald-500/30", borderHover: "hover:border-emerald-500/50", dot: "bg-emerald-500" },
  blue: { border: "border-blue-500/30", borderHover: "hover:border-blue-500/50", dot: "bg-blue-500" },
  red: { border: "border-red-500/30", borderHover: "hover:border-red-500/50", dot: "bg-red-500" },
};

export function UrgentBanner({
  banner,
}: {
  banner: { message: string; href: string; color: string };
}) {
  const colors = bannerColors[banner.color];

  return (
    <Link href={banner.href}>
      <Card className={`mb-4 ${colors.border} ${colors.borderHover} transition-colors cursor-pointer`}>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${colors.dot} animate-pulse`} />
              <span className="text-sm font-medium">{banner.message}</span>
            </div>
            <span className="text-xs text-muted-foreground">&rarr;</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
