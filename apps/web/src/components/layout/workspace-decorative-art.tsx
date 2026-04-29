import React from 'react';

/** Public path — synced from `Downloads/design_elements` → `public/mock-design-elements` */
export const WORKSPACE_DESIGN_ELEMENTS_BASE = '/mock-design-elements';

/**
 * ログインボックス専用の軽量コーナー装飾。親は `relative overflow-hidden` を想定。
 * ダッシュボード hero と同系で、中央の文字・ボタンと重ならないよう縁にだけ配置。
 */
const LOGIN_DECOR_LAYERS = [
  {
    src: '02_green_blob.png',
    cls: 'bottom-[-16%] left-[-12%] w-[min(88px,36%)] max-w-none opacity-[0.22]',
  },
  {
    src: '01_blue_circle.png',
    cls: 'top-[-6%] right-[-5%] w-[40px] max-w-none opacity-[0.3]',
  },
  {
    src: '05_blue_line_area.png',
    cls: 'bottom-[4%] right-[-12%] w-[min(72px,40%)] max-w-none opacity-[0.18]',
  },
  {
    src: '06_blue_donut.png',
    cls: 'bottom-[min(22%,5.5rem)] right-[2%] w-[36px] max-w-none opacity-[0.2] max-sm:hidden',
  },
] as const;

export function WorkspaceDecorativeArt(): React.ReactElement {
  const base = WORKSPACE_DESIGN_ELEMENTS_BASE;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]"
      aria-hidden
    >
      {LOGIN_DECOR_LAYERS.map((layer) => (
        <img
          key={layer.src}
          src={`${base}/${layer.src}`}
          alt=""
          className={`absolute object-contain select-none ${layer.cls}`}
        />
      ))}
    </div>
  );
}
