'use client';

import { summarizeFlexJsonForPreview } from './flex-preview-summary.js';

export type FlexPreviewProps = Readonly<{
  jsonText: string;
}>;

export function FlexPreview({ jsonText }: FlexPreviewProps) {
  const s = summarizeFlexJsonForPreview(jsonText);
  if (!s.ok) {
    return <p className="text-xs text-gray-500 mt-1">{s.parseError}</p>;
  }
  return (
    <div className="mt-2 rounded border border-dashed border-gray-200 p-3 bg-gray-50 text-xs space-y-1 text-gray-700">
      <div>
        <span className="font-medium text-gray-600">type:</span> {s.typeLabel}
      </div>
      {s.altText ? (
        <div>
          <span className="font-medium text-gray-600">altText:</span> {s.altText}
        </div>
      ) : null}
      {s.sizeHint ? (
        <div>
          <span className="font-medium text-gray-600">構成:</span> {s.sizeHint}
        </div>
      ) : null}
      <p className="text-[11px] text-gray-400 pt-1">
        実機の見た目は LINE 公式シミュレータで確認してください（ここでは JSON
        の要約のみ表示します）。
      </p>
    </div>
  );
}
