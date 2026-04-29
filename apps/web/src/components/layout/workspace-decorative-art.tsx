import React from 'react';
import {
  pickDecorIndices,
  WORKSPACE_DECOR_ASSETS,
} from '@/components/layout/workspace-decor-assets';

/** Public path — synced from `Downloads/design_elements` → `public/mock-design-elements` */
export const WORKSPACE_DESIGN_ELEMENTS_BASE = '/mock-design-elements';

/** ~4×: header 16 / compact 12 / ambient 12 枚 */
const HEADER_POSITIONS = [
  'left-[-14%] bottom-[-40%] w-[156px] opacity-[0.42]',
  'right-[-6%] top-[-18%] w-[88px] opacity-[0.46]',
  'right-[8%] bottom-[-28%] w-[118px] opacity-[0.34]',
  'right-[1%] top-[4%] w-[138px] opacity-[0.28] max-sm:hidden',
  'left-[8%] top-[-12%] w-[72px] opacity-[0.38]',
  'left-[32%] bottom-[-20%] w-[96px] opacity-[0.26] max-md:hidden',
  'right-[28%] top-[2%] w-[64px] opacity-[0.32]',
  'left-[-4%] top-[22%] w-[84px] opacity-[0.24]',
  'right-[42%] bottom-[-8%] w-[76px] opacity-[0.3] max-sm:hidden',
  'left-[52%] top-[-8%] w-[58px] opacity-[0.22] max-lg:hidden',
  'right-[18%] top-[35%] w-[68px] opacity-[0.28] max-md:hidden',
  'left-[22%] bottom-[8%] w-[92px] opacity-[0.2] max-sm:hidden',
  'right-[55%] bottom-[12%] w-[54px] opacity-[0.36]',
  'left-[65%] top-[12%] w-[62px] opacity-[0.18] max-lg:hidden',
  'right-[65%] top-[-6%] w-[70px] opacity-[0.24] max-md:hidden',
  'left-[42%] top-[38%] w-[48px] opacity-[0.3] max-sm:hidden',
] as const;

const COMPACT_POSITIONS = [
  'left-[-18%] bottom-[-22%] w-[104px] opacity-[0.38]',
  'right-[-10%] top-[-12%] w-[76px] opacity-[0.44]',
  'right-[12%] bottom-[-16%] w-[88px] opacity-[0.32]',
  'left-[5%] top-[-8%] w-[64px] opacity-[0.28]',
  'right-[35%] top-[8%] w-[56px] opacity-[0.26]',
  'left-[28%] bottom-[-6%] w-[72px] opacity-[0.22]',
  'right-[-2%] bottom-[18%] w-[60px] opacity-[0.3]',
  'left-[55%] top-[22%] w-[48px] opacity-[0.2] max-sm:hidden',
  'right-[48%] bottom-[8%] w-[52px] opacity-[0.34]',
  'left-[40%] top-[-4%] w-[44px] opacity-[0.24]',
  'right-[8%] top-[40%] w-[40px] opacity-[0.28]',
  'left-[-6%] top-[35%] w-[68px] opacity-[0.2]',
] as const;

const AMBIENT_POSITIONS = [
  'left-[-12%] top-[2%] w-[min(55vw,320px)] opacity-[0.22]',
  'right-[-8%] bottom-[5%] w-[min(52vw,300px)] opacity-[0.2] max-lg:hidden',
  'left-[15%] bottom-[-22%] w-[min(42vw,240px)] opacity-[0.18] max-md:hidden',
  'right-[25%] top-[-15%] w-[min(38vw,200px)] opacity-[0.16] max-sm:hidden',
  'left-[40%] top-[35%] w-[min(28vw,160px)] opacity-[0.14] max-lg:hidden',
  'right-[5%] top-[45%] w-[min(32vw,180px)] opacity-[0.15]',
  'left-[-6%] bottom-[30%] w-[min(36vw,190px)] opacity-[0.12] max-md:hidden',
  'right-[40%] bottom-[-18%] w-[min(44vw,220px)] opacity-[0.17]',
  'left-[60%] top-[8%] w-[min(24vw,140px)] opacity-[0.13] max-md:hidden',
  'right-[-4%] top-[28%] w-[min(30vw,170px)] opacity-[0.14] max-sm:hidden',
  'left-[8%] top-[48%] w-[min(34vw,185px)] opacity-[0.11] max-lg:hidden',
  'left-[72%] bottom-[8%] w-[min(26vw,150px)] opacity-[0.16] max-sm:hidden',
] as const;

export type WorkspaceDecorativeArtDensity = 'header' | 'compact' | 'ambient';

type WorkspaceDecorativeArtProps = Readonly<{
  seed: string;
  density?: WorkspaceDecorativeArtDensity;
}>;

/**
 * mock-design-elements の PNG を多層で配置（親は `relative overflow-hidden`）。
 */
export function WorkspaceDecorativeArt({
  seed,
  density = 'header',
}: WorkspaceDecorativeArtProps): React.ReactElement {
  const isCompact = density === 'compact';
  const isAmbient = density === 'ambient';
  const positions = isAmbient
    ? AMBIENT_POSITIONS
    : isCompact
      ? COMPACT_POSITIONS
      : HEADER_POSITIONS;
  const count = positions.length;
  const idxs = pickDecorIndices(`${seed}:${density}`, count, WORKSPACE_DECOR_ASSETS.length);
  const files = idxs.map((i) => WORKSPACE_DECOR_ASSETS[i]);

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
          className={`absolute object-contain select-none ${positions[i]}`}
        />
      ))}
    </div>
  );
}
