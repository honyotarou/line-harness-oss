import React from 'react';

/** Public path — synced from `Downloads/design_elements` → `public/mock-design-elements` */
export const WORKSPACE_DESIGN_ELEMENTS_BASE = '/mock-design-elements';

const POOL = [
  '02_green_blob.png',
  '04_purple_cloud.png',
  '03_peach_wave_area.png',
  '01_blue_circle.png',
  '05_blue_line_area.png',
  '06_blue_donut.png',
  '25_blue_scribble.png',
  '18_green_branch.png',
  '47_blue_area_chart.png',
  '37_blue_dot_grid.png',
  '20_green_loop_arrow.png',
  '41_blue_dot_circle.png',
  '49_blue_wave_line.png',
  '35_green_sparkle.png',
  '46_purple_plus_sparkles.png',
] as const;

function pickUniqueIndices(seed: string, count: number, modulo: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const out: number[] = [];
  let guard = 0;
  while (out.length < count && guard < 200) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const v = h % modulo;
    if (!out.includes(v)) out.push(v);
    guard++;
  }
  while (out.length < count) {
    out.push(out.length % modulo);
  }
  return out;
}

export type WorkspaceDecorativeArtDensity = 'header' | 'compact' | 'ambient';

type WorkspaceDecorativeArtProps = Readonly<{
  /** Page title (or any stable string) — changes which assets appear */
  seed: string;
  density?: WorkspaceDecorativeArtDensity;
}>;

/**
 * Soft PNG accents from `mock-design-elements` (same source as dashboard mock).
 * Renders behind content; parent must be `relative overflow-hidden`.
 */
export function WorkspaceDecorativeArt({
  seed,
  density = 'header',
}: WorkspaceDecorativeArtProps): React.ReactElement {
  const isCompact = density === 'compact';
  const isAmbient = density === 'ambient';
  const count = isAmbient ? 2 : isCompact ? 3 : 4;
  const idxs = pickUniqueIndices(seed, count, POOL.length);
  const files = idxs.map((i) => POOL[i]);

  const positions = isAmbient
    ? [
        'left-[-8%] top-[8%] w-[min(42vw,240px)] opacity-[0.07]',
        'right-[-6%] bottom-[12%] w-[min(38vw,200px)] opacity-[0.06] max-lg:hidden',
      ]
    : isCompact
      ? [
          'left-[-12%] bottom-[-18%] w-[76px] opacity-[0.15]',
          'right-[-8%] top-[-8%] w-[52px] opacity-[0.18]',
          'right-[18%] bottom-[-12%] w-[60px] opacity-[0.12]',
        ]
      : [
          'left-[-10%] bottom-[-28%] w-[108px] opacity-[0.16]',
          'right-[-3%] top-[-8%] w-[58px] opacity-[0.2]',
          'right-[12%] bottom-[-20%] w-[92px] opacity-[0.13]',
          'right-[2%] bottom-[0%] w-[118px] opacity-[0.11] max-sm:hidden',
        ];

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      aria-hidden
    >
      {files.map((file, i) => (
        <img
          key={`${seed}-${i}-${file}`}
          src={`${WORKSPACE_DESIGN_ELEMENTS_BASE}/${file}`}
          alt=""
          className={`absolute object-contain select-none ${positions[i] ?? positions[positions.length - 1]}`}
        />
      ))}
    </div>
  );
}
