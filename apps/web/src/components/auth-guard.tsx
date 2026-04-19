'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api, clearAdminSessionToken } from '@/lib/api';
import {
  recordAuthGuardRedirectToLogin,
  shouldAllowAuthGuardRedirectToLogin,
} from '@/lib/auth-guard-login-redirect-limit';
import { shouldAuthGuardBlockUiForSessionRecheck } from '@/lib/auth-guard-session-recheck';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [redirectLoopHalt, setRedirectLoopHalt] = useState(false);
  const previousPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (pathname === '/login') {
        previousPathnameRef.current = '/login';
        setRedirectLoopHalt(false);
        setChecked(true);
        return;
      }

      const previousPathname = previousPathnameRef.current;
      const blockUi = shouldAuthGuardBlockUiForSessionRecheck({ pathname, previousPathname });
      previousPathnameRef.current = pathname;

      if (blockUi) {
        setChecked(false);
        setRedirectLoopHalt(false);
      }

      try {
        const session = await api.auth.session();
        if (!cancelled && session.success && session.data.authenticated) {
          setRedirectLoopHalt(false);
          setChecked(true);
          return;
        }
      } catch {
        // fall through to redirect
      }

      if (!cancelled) {
        clearAdminSessionToken();
        if (!shouldAllowAuthGuardRedirectToLogin()) {
          setRedirectLoopHalt(true);
          setChecked(true);
          return;
        }
        recordAuthGuardRedirectToLogin();
        // Full navigation: client `router.replace('/login')` triggers RSC `login.txt` fetch
        // which can redirect to Cloudflare Access on another origin and fail CORS preflight.
        window.location.replace('/login');
      }
    };

    void check();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (redirectLoopHalt) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-gray-800 max-w-md">
          ログイン確認が短時間に繰り返し失敗しました（リダイレクトループの抑止）。タブを閉じるかページを再読み込みしてから、もう一度お試しください。
        </p>
        <button
          type="button"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
          onClick={() => {
            window.location.replace('/login');
          }}
        >
          ログイン画面へ
        </button>
      </div>
    );
  }

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-[3px] border-gray-200 border-t-green-500 rounded-full" />
      </div>
    );
  }

  return <>{children}</>;
}
