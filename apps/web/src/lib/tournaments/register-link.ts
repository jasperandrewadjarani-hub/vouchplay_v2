/**
 * Registration deep-link path (handover §19.3, §28.1). Server-safe util (NO 'use client') so it can
 * be called from both the server tournament page and the client register CTA. `?register=1` scrolls
 * the recipient straight to the registration section; anon visitors are guided to signup with this as
 * the resume target.
 */
export function registerNext(slug: string): string {
  return `/tournaments/${slug}?register=1`;
}
