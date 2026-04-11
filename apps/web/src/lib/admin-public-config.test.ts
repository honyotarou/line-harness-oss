import { afterEach, describe, expect, it } from 'vitest';
import {
  allowAdminApiUrlPlaceholderTemplate,
  getAdminWorkerApiOrigin,
  isAdminCloudflareAccessLoginEnabled,
} from './admin-public-config.js';

describe('admin-public-config', () => {
  const saved = {
    api: process.env.NEXT_PUBLIC_API_URL,
    cf: process.env.NEXT_PUBLIC_USE_CLOUDFLARE_ACCESS_LOGIN,
    nodeEnv: process.env.NODE_ENV,
  };

  afterEach(() => {
    if (saved.api === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = saved.api;
    if (saved.cf === undefined) delete process.env.NEXT_PUBLIC_USE_CLOUDFLARE_ACCESS_LOGIN;
    else process.env.NEXT_PUBLIC_USE_CLOUDFLARE_ACCESS_LOGIN = saved.cf;
    process.env.NODE_ENV = saved.nodeEnv;
  });

  it('getAdminWorkerApiOrigin prefers NEXT_PUBLIC_API_URL', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://worker.example.com';
    expect(getAdminWorkerApiOrigin()).toBe('https://worker.example.com');
  });

  it('isAdminCloudflareAccessLoginEnabled reads truthy flag', () => {
    process.env.NEXT_PUBLIC_USE_CLOUDFLARE_ACCESS_LOGIN = '1';
    expect(isAdminCloudflareAccessLoginEnabled()).toBe(true);
    process.env.NEXT_PUBLIC_USE_CLOUDFLARE_ACCESS_LOGIN = '0';
    expect(isAdminCloudflareAccessLoginEnabled()).toBe(false);
  });

  it('allowAdminApiUrlPlaceholderTemplate is false in production NODE_ENV', () => {
    process.env.NODE_ENV = 'production';
    expect(allowAdminApiUrlPlaceholderTemplate()).toBe(false);
    process.env.NODE_ENV = 'development';
    expect(allowAdminApiUrlPlaceholderTemplate()).toBe(true);
  });
});
