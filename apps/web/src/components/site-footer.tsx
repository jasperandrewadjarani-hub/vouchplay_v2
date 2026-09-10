import Link from 'next/link';
import { BRAND } from '@vouchplay/config';

/**
 * Persistent app-wide footer (master_plan §2R): About / FAQ / Terms / Privacy always reachable from
 * the bottom of every in-app page, plus the developer credit. Rendered once by the app shell, so
 * individual pages no longer carry their own copy.
 */
export function SiteFooter() {
  return (
    <footer className="border-border text-foreground-muted mt-10 border-t pt-5 text-center">
      <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        <Link href="/about" className="hover:text-foreground">
          About
        </Link>
        <Link href="/faq" className="hover:text-foreground">
          FAQ
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          Terms
        </Link>
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
      </nav>
      <a
        href={BRAND.jtFacebookUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground mt-2 inline-block text-[11px]"
      >
        Developed by {BRAND.developer}
      </a>
    </footer>
  );
}
