import { afterEach, describe, expect, it } from 'vitest';
import {
  resetAdminAccessDocumentRedirectClaimForTests,
  tryClaimAdminAccessDocumentRedirect,
} from './admin-access-document-redirect-mutex.js';

describe('tryClaimAdminAccessDocumentRedirect', () => {
  afterEach(() => {
    resetAdminAccessDocumentRedirectClaimForTests();
  });

  it('returns true once then false', () => {
    expect(tryClaimAdminAccessDocumentRedirect()).toBe(true);
    expect(tryClaimAdminAccessDocumentRedirect()).toBe(false);
  });
});
