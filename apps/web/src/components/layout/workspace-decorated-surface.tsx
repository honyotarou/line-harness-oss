'use client';

import type { ReactNode } from 'react';
import { WORKSPACE_DESIGN_ELEMENTS_BASE } from '@/components/layout/workspace-decorative-art';

export type WorkspacePageDecorVariant =
  | 'friends'
  | 'scenarios'
  | 'broadcasts'
  | 'templates'
  | 'automations'
  | 'scoring'
  | 'chats'
  | 'health';

type CornerPair = Readonly<{
  bl: string;
  tr: string;
  blClass: string;
  trClass: string;
}>;

/** 左下＝緑系・右上＝青系の3パターン（ダッシュボード hero / metric と同系、素材だけ交代） */
const ACCENT_ROTATION: ReadonlyArray<CornerPair> = [
  {
    bl: '02_green_blob.png',
    tr: '01_blue_circle.png',
    blClass: 'bottom-[-30%] left-[-12%] w-[min(220px,52vw)] max-w-none opacity-[0.26]',
    trClass: 'top-[6%] right-[-4%] w-[76px] max-w-none opacity-[0.34]',
  },
  {
    bl: '18_green_branch.png',
    tr: '10_blue_circle_outline.png',
    blClass: 'bottom-[-18%] left-[-8%] w-[min(180px,45vw)] max-w-none opacity-[0.22]',
    trClass: 'top-[4%] right-[-2%] w-[64px] max-w-none opacity-[0.3]',
  },
  {
    bl: '14_green_leaf.png',
    tr: '05_blue_line_area.png',
    blClass: 'bottom-[-24%] left-[-6%] w-[min(140px,38vw)] max-w-none opacity-[0.24]',
    trClass: 'top-[8%] right-[2%] w-[min(100px,28vw)] max-w-none opacity-[0.28]',
  },
];

const VARIANT_OFFSET: Record<WorkspacePageDecorVariant, number> = {
  friends: 0,
  scenarios: 1,
  broadcasts: 2,
  templates: 0,
  automations: 1,
  scoring: 2,
  chats: 0,
  health: 1,
};

type WorkspaceDecoratedSurfaceProps = Readonly<{
  variant: WorkspacePageDecorVariant;
  /** 一覧カードなどで `index` を渡すとコーナー素材がローテーション */
  accent?: number;
  className?: string;
  children: ReactNode;
}>;

/**
 * サブページのカード用コーナー装飾（ダッシュボードの緑左下・青右上トーンと整合）。
 */
export function WorkspaceDecoratedSurface({
  variant,
  accent = 0,
  className = '',
  children,
}: WorkspaceDecoratedSurfaceProps): React.ReactElement {
  const base = WORKSPACE_DESIGN_ELEMENTS_BASE;
  const idx = (VARIANT_OFFSET[variant] + accent) % ACCENT_ROTATION.length;
  const pair = ACCENT_ROTATION[idx]!;

  return (
    <div className={`relative overflow-hidden bg-[rgba(255,255,255,0.97)] ${className}`}>
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <img
          src={`${base}/${pair.bl}`}
          alt=""
          className={`absolute object-contain select-none ${pair.blClass}`}
        />
        <img
          src={`${base}/${pair.tr}`}
          alt=""
          className={`absolute object-contain select-none ${pair.trClass}`}
        />
        <div
          className="absolute inset-0 mix-blend-soft-light opacity-90"
          style={{
            background:
              'linear-gradient(118deg, rgba(6, 199, 85, 0.045), transparent 44%, rgba(59, 130, 246, 0.065))',
          }}
        />
      </div>
      <div className="relative z-[1] min-h-0">{children}</div>
    </div>
  );
}
