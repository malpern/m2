import Link from "next/link";
import { Button } from "@/components/ui/button";

const ACCENT = "#6c8cff";
const SHADOW = "#2e3345";
const FILL_LIGHT = "rgba(108,140,255,0.1)";

function CalendarPlusIcon() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Calendar body */}
      <rect
        x="12"
        y="18"
        width="56"
        height="48"
        rx="6"
        stroke={ACCENT}
        strokeWidth="1.5"
        fill={FILL_LIGHT}
      />
      {/* Top bar */}
      <path
        d="M12 24C12 20.6863 14.6863 18 18 18H62C65.3137 18 68 20.6863 68 24V30H12V24Z"
        fill={ACCENT}
        fillOpacity="0.15"
        stroke={ACCENT}
        strokeWidth="1.5"
      />
      {/* Calendar hangers */}
      <line x1="28" y1="12" x2="28" y2="22" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="52" y1="12" x2="52" y2="22" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
      {/* Grid dots */}
      <circle cx="26" cy="40" r="2" fill={SHADOW} fillOpacity="0.4" />
      <circle cx="40" cy="40" r="2" fill={SHADOW} fillOpacity="0.4" />
      <circle cx="54" cy="40" r="2" fill={SHADOW} fillOpacity="0.4" />
      <circle cx="26" cy="52" r="2" fill={SHADOW} fillOpacity="0.4" />
      <circle cx="40" cy="52" r="2" fill={SHADOW} fillOpacity="0.4" />
      {/* Plus sign */}
      <circle cx="58" cy="56" r="12" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="1.5" />
      <line x1="58" y1="50" x2="58" y2="62" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="52" y1="56" x2="64" y2="56" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CalendarGridIcon() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Calendar body */}
      <rect
        x="10"
        y="16"
        width="60"
        height="52"
        rx="6"
        stroke={ACCENT}
        strokeWidth="1.5"
        fill={FILL_LIGHT}
      />
      {/* Header bar */}
      <path
        d="M10 22C10 18.6863 12.6863 16 16 16H64C67.3137 16 70 18.6863 70 22V28H10V22Z"
        fill={ACCENT}
        fillOpacity="0.15"
        stroke={ACCENT}
        strokeWidth="1.5"
      />
      {/* Hangers */}
      <line x1="26" y1="10" x2="26" y2="20" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="54" y1="10" x2="54" y2="20" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
      {/* Grid lines */}
      <line x1="10" y1="40" x2="70" y2="40" stroke={SHADOW} strokeWidth="0.75" strokeOpacity="0.3" />
      <line x1="10" y1="52" x2="70" y2="52" stroke={SHADOW} strokeWidth="0.75" strokeOpacity="0.3" />
      <line x1="30" y1="28" x2="30" y2="68" stroke={SHADOW} strokeWidth="0.75" strokeOpacity="0.3" />
      <line x1="50" y1="28" x2="50" y2="68" stroke={SHADOW} strokeWidth="0.75" strokeOpacity="0.3" />
      {/* Highlight cell */}
      <rect x="30" y="40" width="20" height="12" fill={ACCENT} fillOpacity="0.12" rx="2" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg
      width="90"
      height="80"
      viewBox="0 0 90 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Person 1 (center, foreground) */}
      <circle cx="45" cy="28" r="10" stroke={ACCENT} strokeWidth="1.5" fill={FILL_LIGHT} />
      <path
        d="M27 62C27 52.0589 35.0589 44 45 44C54.9411 44 63 52.0589 63 62V68H27V62Z"
        stroke={ACCENT}
        strokeWidth="1.5"
        fill={FILL_LIGHT}
      />
      {/* Person 2 (left, background) */}
      <circle cx="22" cy="32" r="7" stroke={SHADOW} strokeWidth="1.2" strokeOpacity="0.5" fill="none" />
      <path
        d="M10 60C10 53.3726 15.3726 48 22 48C26 48 29 49.5 31 52"
        stroke={SHADOW}
        strokeWidth="1.2"
        strokeOpacity="0.5"
        fill="none"
      />
      {/* Person 3 (right, background) */}
      <circle cx="68" cy="32" r="7" stroke={SHADOW} strokeWidth="1.2" strokeOpacity="0.5" fill="none" />
      <path
        d="M80 60C80 53.3726 74.6274 48 68 48C64 48 61 49.5 59 52"
        stroke={SHADOW}
        strokeWidth="1.2"
        strokeOpacity="0.5"
        fill="none"
      />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Paper airplane */}
      <path
        d="M14 40L66 16L50 64L38 44L14 40Z"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill={FILL_LIGHT}
      />
      <line
        x1="38"
        y1="44"
        x2="66"
        y2="16"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Motion lines */}
      <line x1="8" y1="34" x2="18" y2="34" stroke={SHADOW} strokeWidth="1" strokeOpacity="0.4" strokeLinecap="round" />
      <line x1="4" y1="40" x2="12" y2="40" stroke={SHADOW} strokeWidth="1" strokeOpacity="0.3" strokeLinecap="round" />
      <line x1="8" y1="46" x2="16" y2="46" stroke={SHADOW} strokeWidth="1" strokeOpacity="0.4" strokeLinecap="round" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Box body */}
      <path
        d="M12 30L40 16L68 30V58L40 72L12 58V30Z"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill={FILL_LIGHT}
      />
      {/* Center line */}
      <line x1="40" y1="44" x2="40" y2="72" stroke={ACCENT} strokeWidth="1.5" />
      {/* Top lines */}
      <line x1="12" y1="30" x2="40" y2="44" stroke={ACCENT} strokeWidth="1.5" />
      <line x1="68" y1="30" x2="40" y2="44" stroke={ACCENT} strokeWidth="1.5" />
      {/* Ribbon */}
      <line x1="26" y1="23" x2="54" y2="37" stroke={SHADOW} strokeWidth="1" strokeOpacity="0.4" />
      <line x1="54" y1="23" x2="26" y2="37" stroke={SHADOW} strokeWidth="1" strokeOpacity="0.4" />
      {/* Tag */}
      <circle cx="60" cy="22" r="6" stroke={ACCENT} strokeWidth="1.2" fill={ACCENT} fillOpacity="0.15" />
      <circle cx="60" cy="22" r="1.5" fill={ACCENT} />
    </svg>
  );
}

function BarChartIcon() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Axes */}
      <line x1="16" y1="14" x2="16" y2="64" stroke={SHADOW} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
      <line x1="16" y1="64" x2="68" y2="64" stroke={SHADOW} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
      {/* Bars */}
      <rect x="22" y="46" width="8" height="18" rx="2" fill={ACCENT} fillOpacity="0.2" stroke={ACCENT} strokeWidth="1.5" />
      <rect x="34" y="32" width="8" height="32" rx="2" fill={ACCENT} fillOpacity="0.3" stroke={ACCENT} strokeWidth="1.5" />
      <rect x="46" y="22" width="8" height="42" rx="2" fill={ACCENT} fillOpacity="0.4" stroke={ACCENT} strokeWidth="1.5" />
      <rect x="58" y="38" width="8" height="26" rx="2" fill={ACCENT} fillOpacity="0.25" stroke={ACCENT} strokeWidth="1.5" />
      {/* Trend line */}
      <path
        d="M26 44L38 30L50 20L62 36"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

const illustrations = {
  "calendar-plus": CalendarPlusIcon,
  "calendar-grid": CalendarGridIcon,
  people: PeopleIcon,
  message: MessageIcon,
  package: PackageIcon,
  "bar-chart": BarChartIcon,
} as const;

export type EmptyStateIllustration = keyof typeof illustrations;

interface EmptyStateProps {
  illustration: EmptyStateIllustration;
  heading: string;
  description: string;
  ctaLabel: string;
  ctaHref?: string;
  ctaOnClick?: () => void;
}

export function EmptyState({
  illustration,
  heading,
  description,
  ctaLabel,
  ctaHref,
  ctaOnClick,
}: EmptyStateProps) {
  const Illustration = illustrations[illustration];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="mb-5">
        <Illustration />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-1">{heading}</h2>
      <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">
        {description}
      </p>
      {ctaHref ? (
        <Link href={ctaHref}>
          <Button size="sm">{ctaLabel}</Button>
        </Link>
      ) : ctaOnClick ? (
        <Button size="sm" onClick={ctaOnClick}>
          {ctaLabel}
        </Button>
      ) : null}
    </div>
  );
}
