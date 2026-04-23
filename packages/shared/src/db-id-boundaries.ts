import type { AutoReplyId, FormId, FormSubmissionId, LineAccountId } from './types.js';

/** D1 / API row → nominal AutoReply id (UUID string at runtime). */
export function autoReplyIdFromStorage(id: string): AutoReplyId {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('autoReplyId required');
  }
  return id.trim() as AutoReplyId;
}

/** D1 / API row → nominal Form id (UUID string at runtime). */
export function formIdFromStorage(id: string): FormId {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('formId required');
  }
  return id.trim() as FormId;
}

/** D1 / API row → nominal FormSubmission id (UUID string at runtime). */
export function formSubmissionIdFromStorage(id: string): FormSubmissionId {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('formSubmissionId required');
  }
  return id.trim() as FormSubmissionId;
}

/** Nullable FK column → nominal LINE account id or null. */
export function lineAccountIdFromNullable(raw: string | null | undefined): LineAccountId | null {
  if (raw == null) return null;
  const t = raw.trim();
  return t.length === 0 ? null : (t as LineAccountId);
}
