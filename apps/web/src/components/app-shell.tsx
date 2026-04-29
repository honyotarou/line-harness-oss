'use client';
import { usePathname } from 'next/navigation';
import Sidebar from './layout/sidebar';
import AuthGuard from './auth-guard';
import { AccountProvider } from '@/contexts/account-context';
import { WorkspaceDecorativeArt } from '@/components/layout/workspace-decorative-art';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const decorSeed = pathname ?? '/';

  if (pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <AuthGuard>
      <AccountProvider>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="relative flex-1 min-h-0 overflow-auto bg-[var(--color-canvas)] pt-[72px] px-4 pb-6 sm:px-6 lg:pt-8 lg:px-8 lg:pb-8">
            <div className="pointer-events-none absolute inset-0 z-0 overflow-x-hidden" aria-hidden>
              <WorkspaceDecorativeArt seed={`main-${decorSeed}`} density="ambient" />
            </div>
            <div className="relative z-[1] min-h-0">{children}</div>
          </main>
        </div>
      </AccountProvider>
    </AuthGuard>
  );
}
