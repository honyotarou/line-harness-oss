'use client';

type SpringFieldBackdropProps = Readonly<{
  /** `fixed` = viewport fill (e.g. login). `absolute` = fill a `relative` parent. */
  variant?: 'fixed' | 'absolute';
  /** Passed to `background-position` (crop toward yellow field). */
  position?: string;
  className?: string;
}>;

/**
 * Full-bleed rapeseed field. Overlay stays light so the photo reads across the whole area;
 * white cards on top provide contrast.
 */
export function SpringFieldBackdrop({
  variant = 'fixed',
  position = 'center 40%',
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
      <div className="absolute inset-0 bg-gradient-to-b from-black/[0.04] from-0% via-transparent via-50% to-white/18 to-100%" />
    </div>
  );
}
