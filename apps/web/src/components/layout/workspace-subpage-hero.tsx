'use client';

import React from 'react';
import {
  pickDecorIndices,
  WORKSPACE_DECOR_ASSETS,
} from '@/components/layout/workspace-decor-assets';
import { WORKSPACE_DESIGN_ELEMENTS_BASE } from '@/components/layout/workspace-decorative-art';

function seedHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

type WorkspaceSubpageHeroProps = Readonly<{
  pathname: string;
}>;

const HERO_BG_SLOTS = [
  'bottom-[-38%] left-[-14%] w-[min(78vw,280px)] opacity-[0.4]',
  'top-[-28%] right-[2%] w-[min(40vw,168px)] opacity-[0.34]',
  'bottom-[-20%] right-[8%] w-[min(48vw,200px)] opacity-[0.3]',
  'top-[4%] right-[-6%] w-[96px] opacity-[0.36]',
  'top-[8%] left-[-4%] w-[min(36vw,140px)] opacity-[0.28]',
  'bottom-[5%] left-[18%] w-[min(32vw,124px)] opacity-[0.26] max-md:hidden',
  'top-[-8%] left-[30%] w-[88px] opacity-[0.32] max-sm:hidden',
  'bottom-[-8%] left-[42%] w-[104px] opacity-[0.24] max-sm:hidden',
  'top-[22%] right-[22%] w-[76px] opacity-[0.22] max-md:hidden',
  'bottom-[18%] right-[32%] w-[68px] opacity-[0.28]',
  'top-[38%] left-[8%] w-[72px] opacity-[0.2] max-lg:hidden',
  'bottom-[12%] left-[55%] w-[64px] opacity-[0.26] max-sm:hidden',
] as const;

const HERO_MID_SLOTS = [
  'top-[12%] left-[52%] w-[56px] opacity-[0.38]',
  'bottom-[28%] left-[6%] w-[64px] opacity-[0.34]',
  'top-[6%] right-[38%] w-[48px] opacity-[0.42]',
  'bottom-[8%] right-[48%] w-[52px] opacity-[0.36]',
  'top-[45%] left-[28%] w-[44px] opacity-[0.3] max-sm:hidden',
  'top-[20%] left-[62%] w-[40px] opacity-[0.35] max-md:hidden',
  'bottom-[42%] right-[12%] w-[58px] opacity-[0.28]',
  'top-[52%] right-[28%] w-[46px] opacity-[0.32] max-sm:hidden',
  'left-[72%] top-[18%] w-[50px] opacity-[0.26] max-lg:hidden',
  'left-[38%] bottom-[2%] w-[54px] opacity-[0.3]',
] as const;

const HERO_FG_SLOTS = [
  'right-[min(16vw,64px)] bottom-[10px] w-[min(62vw,260px)] opacity-[0.88]',
  'top-[4px] right-[min(24vw,96px)] w-[100px] opacity-[0.72]',
  'right-[8px] bottom-[4px] w-[108px] opacity-[0.58] max-sm:hidden',
  'right-0 bottom-0 w-[min(44vw,168px)] opacity-[0.68]',
  'right-[min(44vw,176px)] bottom-[6px] w-[92px] opacity-[0.52] max-sm:hidden',
  'top-[18px] right-[min(52vw,200px)] w-[78px] opacity-[0.62]',
  'bottom-[20px] left-[min(8vw,24px)] w-[min(40vw,140px)] opacity-[0.45] max-md:hidden',
  'top-[32px] left-[min(12vw,40px)] w-[86px] opacity-[0.4] max-sm:hidden',
  'left-[22%] bottom-[8px] w-[min(34vw,120px)] opacity-[0.48] max-md:hidden',
  'right-[35%] top-[8px] w-[72px] opacity-[0.55]',
  'left-[48%] top-[28px] w-[64px] opacity-[0.42] max-lg:hidden',
  'right-[62%] bottom-[12px] w-[70px] opacity-[0.38] max-sm:hidden',
  'left-[8%] top-[24px] w-[68px] opacity-[0.36]',
  'right-[18%] top-[36px] w-[56px] opacity-[0.44] max-md:hidden',
] as const;

/**
 * サブページ上部の装飾帯（3レイヤー計36枚 + 多層グラデ／約4倍相当）。
 */
export function WorkspaceSubpageHero({ pathname }: WorkspaceSubpageHeroProps): React.ReactElement {
  const h = seedHash(pathname);
  const base = WORKSPACE_DESIGN_ELEMENTS_BASE;

  const bgPick = pickDecorIndices(
    `${pathname}:hero-bg`,
    HERO_BG_SLOTS.length,
    WORKSPACE_DECOR_ASSETS.length,
  );
  const midPick = pickDecorIndices(
    `${pathname}:hero-mid`,
    HERO_MID_SLOTS.length,
    WORKSPACE_DECOR_ASSETS.length,
  );
  const fgPick = pickDecorIndices(
    `${pathname}:hero-fg`,
    HERO_FG_SLOTS.length,
    WORKSPACE_DECOR_ASSETS.length,
  );

  return (
    <section
      className="relative mb-6 overflow-hidden rounded-[var(--radius-token-lg)] border border-[var(--color-border)] shadow-[var(--shadow-token-md)]"
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{
          background: `
            linear-gradient(110deg, rgba(255, 255, 255, 0.99), rgba(239, 246, 255, 0.96)),
            radial-gradient(circle at 88% 22%, rgba(59, 130, 246, 0.18), transparent 46%),
            radial-gradient(ellipse 70% 50% at 8% 80%, rgba(147, 197, 253, 0.14), transparent 52%),
            radial-gradient(circle at 50% 120%, rgba(155, 89, 208, 0.08), transparent 38%)
          `,
        }}
      />
      <div
        className="absolute inset-0 mix-blend-soft-light opacity-[0.35]"
        style={{
          background: `linear-gradient(${125 + (h % 40)}deg, rgba(59, 130, 246, 0.06), transparent 55%, rgba(244, 160, 52, 0.05))`,
        }}
      />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {HERO_BG_SLOTS.map((slot, i) => (
          <img
            key={`bg-${pathname}-${i}`}
            src={`${base}/${WORKSPACE_DECOR_ASSETS[bgPick[i]]}`}
            alt=""
            className={`absolute max-w-none object-contain select-none ${slot}`}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {HERO_MID_SLOTS.map((slot, i) => (
          <img
            key={`mid-${pathname}-${i}`}
            src={`${base}/${WORKSPACE_DECOR_ASSETS[midPick[i]]}`}
            alt=""
            className={`absolute object-contain select-none ${slot}`}
          />
        ))}
      </div>
      <div className="pointer-events-none relative min-h-[220px] sm:min-h-[280px] md:min-h-[300px]">
        {HERO_FG_SLOTS.map((slot, i) => (
          <img
            key={`fg-${pathname}-${i}`}
            src={`${base}/${WORKSPACE_DECOR_ASSETS[fgPick[i]]}`}
            alt=""
            className={`absolute object-contain select-none ${slot}`}
          />
        ))}
      </div>
    </section>
  );
}
