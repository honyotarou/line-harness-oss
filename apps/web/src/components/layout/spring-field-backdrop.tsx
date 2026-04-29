'use client';

type SpringFieldBackdropProps = Readonly<{
  /** `fixed` = viewport fill (e.g. login). `absolute` = fill a `relative` parent. */
  variant?: 'fixed' | 'absolute';
  /** Unused (kept for call-site compatibility). */
  position?: string;
  className?: string;
}>;

/**
 * Light CRM mesh background (青・白のソフトグラデーション)。
 * 旧ヒーロー写真は撤去し、mock 系ダッシュボードと同じトーンに揃える。
 */
export function SpringFieldBackdrop({
  variant = 'fixed',
  className = '',
}: SpringFieldBackdropProps) {
  const box = variant === 'fixed' ? 'fixed inset-0' : 'absolute inset-0';
  return (
    <div className={`pointer-events-none -z-10 ${box} ${className}`.trim()} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 120% 80% at 10% 0%, rgba(59, 130, 246, 0.09), transparent 50%),
            radial-gradient(ellipse 90% 60% at 90% 10%, rgba(147, 197, 253, 0.12), transparent 45%),
            linear-gradient(180deg, #ffffff 0%, #f8fafc 55%, #f1f5f9 100%)
          `,
        }}
      />
    </div>
  );
}
