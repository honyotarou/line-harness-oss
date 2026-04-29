import React from 'react';
import { WorkspaceDecorativeArt } from '@/components/layout/workspace-decorative-art';

type HeaderProps = Readonly<{
  title: string;
  description?: string;
  action?: React.ReactNode;
}>;

export default function Header({ title, description, action }: HeaderProps) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-[var(--radius-token-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-5 py-5 shadow-[var(--shadow-token-sm)] sm:px-6">
      <WorkspaceDecorativeArt seed={title} density="header" />
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-foreground)] sm:text-[26px]">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 text-sm font-medium text-[var(--color-foreground-muted)]">
              {description}
            </p>
          )}
        </div>
        {action && <div className="shrink-0 sm:ml-4">{action}</div>}
      </div>
    </div>
  );
}
