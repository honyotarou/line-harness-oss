'use client';

import { useState } from 'react';
import PromptModal, { type PromptTemplate } from '@/components/prompt-modal';

type CcPromptButtonProps = Readonly<{
  prompts: PromptTemplate[];
  /**
   * `fixed` — ビューポート右下（既定・他ページと同じ）
   * `inline-end` — 親レイアウト内の右端（帯の中に収めたいとき）
   */
  dock?: 'fixed' | 'inline-end';
}>;

export default function CcPromptButton({ prompts, dock = 'fixed' }: CcPromptButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const buttonClass =
    dock === 'fixed'
      ? 'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 min-h-[48px] bg-gray-900 text-white text-sm font-medium rounded-full shadow-lg hover:bg-gray-800 transition-colors'
      : 'relative z-10 ml-auto flex w-fit max-w-full items-center gap-2 px-4 py-3 min-h-[48px] bg-gray-900 text-white text-sm font-medium rounded-full shadow-lg hover:bg-gray-800 transition-colors';

  return (
    <>
      <button onClick={() => setIsOpen(true)} className={buttonClass} aria-label="CCに依頼">
        <span className="text-base leading-none">📋</span>
        <span className="hidden sm:inline">CCに依頼</span>
      </button>

      <PromptModal isOpen={isOpen} onClose={() => setIsOpen(false)} prompts={prompts} />
    </>
  );
}
