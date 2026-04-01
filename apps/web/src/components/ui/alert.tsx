import type { HTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'error' | 'info';

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  variant?: Variant;
};

export function Alert({ variant = 'info', className, ...props }: AlertProps) {
  const styles =
    variant === 'error'
      ? 'bg-[var(--color-error-muted)] border border-[var(--color-error-border)] text-[var(--color-error)]'
      : 'bg-[var(--color-slate-muted)] border border-[var(--color-border)] text-[var(--color-foreground)]';

  return (
    <div
      className={cn('rounded-lg p-4 text-sm', styles, className)}
      role={variant === 'error' ? 'alert' : undefined}
      {...props}
    />
  );
}
