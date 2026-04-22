'use client';

type SpringFieldBackdropProps = Readonly<{
  /** `fixed` = viewport fill (e.g. login). `absolute` = fill a `relative` parent. */
  variant?: 'fixed' | 'absolute';
  /** Passed to `background-position` (crop toward yellow field). */
  position?: string;
  className?: string;
}>;

export function SpringFieldBackdrop({
  variant = 'fixed',
  position = 'center 38%',
  className = '',
}: SpringFieldBackdropProps) {
  const box = variant === 'fixed' ? 'fixed inset-0' : 'absolute inset-0';
  return (
    <div className={`pointer-events-none -z-10 ${box} ${className}`.trim()} aria-hidden>
      <div
        className="absolute inset-0 bg-cover"
        style={{
          backgroundImage: "url('/hero-spring-field.png')",
          backgroundPosition: position,
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-[var(--color-canvas)]/72 to-[var(--color-canvas)]/94" />
    </div>
  );
}
