import Link from "next/link";
import Image from "next/image";

/**
 * Shell for the public legal pages.
 *
 * These are linked from the Google OAuth consent screen, so they must render
 * for a signed-out visitor and must keep working independently of the app's
 * auth state. Self-contained by design.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[680px] px-6 py-12">
      <header className="mb-8">
        <Link href="/" className="inline-block">
          <Image
            src="/m2logo.png"
            alt="M2 Performance and Therapy"
            width={120}
            height={48}
            className="mb-6 h-12 w-auto"
          />
        </Link>
        <h1 className="text-[28px] font-bold leading-tight">{title}</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">Last updated: {updated}</p>
      </header>

      <div className="space-y-6 text-[15px] leading-[1.7] text-muted-foreground [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-[18px] [&_h2]:font-semibold [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_strong]:text-foreground [&_a]:text-blue-400 [&_a]:underline">
        {children}
      </div>

      <footer className="mt-12 border-t border-border pt-6 text-[13px] text-muted-foreground">
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
        </p>
      </footer>
    </div>
  );
}

/** The business's postal contact block, identical on both pages. */
export function ContactBlock() {
  return (
    <p>
      M2 Performance and Therapy
      <br />
      2310 Homestead Road, Suite G2
      <br />
      Los Altos, CA 94024
      <br />
      (408) 599-1777
    </p>
  );
}
