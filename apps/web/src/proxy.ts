import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Next 16 "proxy" (formerly middleware). Refreshes the Supabase session cookie on navigation.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on pages only — exclude static assets, images, icons, and brand files (handover §34A.9).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|brand/|.*\\.(?:png|jpg|jpeg|webp|svg|ico)$).*)',
  ],
};
