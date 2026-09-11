/**
 * Identity document types (master_plan §2AG Phase C). A plain module - NOT in the `'use server'`
 * action file - so a client component (the upload form) can import the list. A `'use server'` module
 * may only export async functions; exporting this const from there made it `undefined` on the client,
 * which crashed the form's `.map` (the "Something went wrong" error on Verify ID).
 */
export const IDENTITY_DOCUMENT_TYPES = [
  'national_id',
  'passport',
  'drivers_license',
  'other',
] as const;

export type IdentityDocumentType = (typeof IDENTITY_DOCUMENT_TYPES)[number];
