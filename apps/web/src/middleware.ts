import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Refreshes the Supabase session cookie on navigation.
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on pages only - exclude static assets, images, icons, and brand files (handover §34A.9).
  // Also exclude sw.js (the service worker route - a session cookie refresh on it would just be
  // wasted work, since it is never navigated to) and /offline (must work with no network, so it
  // cannot depend on a middleware round trip either) - master_plan §2AY.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|brand/|sw.js|offline|.*\\.(?:png|jpg|jpeg|webp|svg|ico)$).*)',
  ],
};
