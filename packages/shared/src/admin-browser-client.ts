/**
 * Custom header for admin browser requests (CSRF mitigation with SameSite=None cookies).
 * Not a LINE Platform header — named after the LINE Harness product.
 * Must match the Worker CORS allow-list (`ACCESS_CONTROL_ALLOW_HEADERS` in cors-policy).
 */
export const ADMIN_BROWSER_CLIENT_HEADER = 'X-Line-Harness-Client' as const;
export const ADMIN_BROWSER_CLIENT_HEADER_VALUE = '1' as const;
