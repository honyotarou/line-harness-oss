import { ADMIN_BROWSER_CLIENT_HEADER, ADMIN_BROWSER_CLIENT_HEADER_VALUE } from '@line-crm/shared';
import { describe, expect, it } from 'vitest';
import {
  adminBrowserClientHeaderName,
  adminBrowserClientHeaderValue,
  isStateChangingAdminMethod,
  shouldRequireAdminBrowserClientHeader,
} from '../../src/services/admin-browser-csrf.js';

describe('admin-browser-csrf', () => {
  it('treats POST, PUT, PATCH, DELETE as state-changing', () => {
    expect(isStateChangingAdminMethod('POST')).toBe(true);
    expect(isStateChangingAdminMethod('PUT')).toBe(true);
    expect(isStateChangingAdminMethod('PATCH')).toBe(true);
    expect(isStateChangingAdminMethod('DELETE')).toBe(true);
    expect(isStateChangingAdminMethod('GET')).toBe(false);
    expect(isStateChangingAdminMethod('HEAD')).toBe(false);
    expect(isStateChangingAdminMethod('OPTIONS')).toBe(false);
  });

  it('requires header only when state-changing, no Bearer, and session cookie present', () => {
    expect(shouldRequireAdminBrowserClientHeader('GET', undefined, null)).toBe(false);
    expect(shouldRequireAdminBrowserClientHeader('POST', undefined, null)).toBe(false);
    expect(shouldRequireAdminBrowserClientHeader('POST', 'Bearer tok', 'cook')).toBe(false);
    expect(shouldRequireAdminBrowserClientHeader('POST', undefined, 'cookie-val')).toBe(true);
    expect(shouldRequireAdminBrowserClientHeader('POST', '', 'cookie-val')).toBe(true);
    expect(shouldRequireAdminBrowserClientHeader('GET', undefined, 'cookie-val')).toBe(false);
  });

  it('requires header when Authorization is present but not Bearer (cookie is still the token)', () => {
    expect(shouldRequireAdminBrowserClientHeader('POST', 'Basic x', 'cookie-val')).toBe(true);
  });

  it('matches @line-crm/shared so Worker CORS, middleware, and admin web stay aligned', () => {
    expect(adminBrowserClientHeaderName).toBe(ADMIN_BROWSER_CLIENT_HEADER);
    expect(adminBrowserClientHeaderValue).toBe(ADMIN_BROWSER_CLIENT_HEADER_VALUE);
    expect(ADMIN_BROWSER_CLIENT_HEADER).toBe('X-Line-Harness-Client');
    expect(ADMIN_BROWSER_CLIENT_HEADER_VALUE).toBe('1');
  });
});
