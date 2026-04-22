/**
 * racheck-logo.png のキャンバス四隅に入った黒を、角丸クリップで隠す。
 */
export type RaCheckLogoVariant = 'sidebar' | 'sidebar-mobile' | 'dashboard' | 'login';

const boxClass: Record<RaCheckLogoVariant, string> = {
  sidebar: 'h-9 w-9',
  'sidebar-mobile': 'h-8 w-8',
  dashboard: 'h-14 w-14 sm:h-16 sm:w-16',
  login:
    'mx-auto h-[clamp(4.5rem,24vw,8.25rem)] w-[clamp(4.5rem,24vw,8.25rem)] max-h-[240px] max-w-[min(100%,240px)]',
};

const shadowClass: Record<RaCheckLogoVariant, string | undefined> = {
  sidebar: undefined,
  'sidebar-mobile': undefined,
  dashboard: 'drop-shadow-[0_2px_10px_rgb(0_0_0/0.12)]',
  login: 'drop-shadow-[0_2px_14px_rgb(0_0_0/0.18)]',
};

export function RaCheckLogo({
  variant,
  alt = 'らチェク',
  className,
}: {
  variant: RaCheckLogoVariant;
  alt?: string;
  /** ラッパーに追加（配置用） */
  className?: string;
}) {
  const shadow = shadowClass[variant];
  return (
    <span
      className={[
        'inline-block shrink-0 overflow-hidden rounded-[22%] bg-white',
        boxClass[variant],
        shadow,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <img
        src="/racheck-logo.png"
        alt={alt}
        width={512}
        height={512}
        className="block h-full w-full object-contain"
        decoding="async"
      />
    </span>
  );
}
