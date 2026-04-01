import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type BadgeProps = HTMLAttributes<HTMLSpanElement>;

export function Badge({ className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        className,
      )}
      {...props}
    />
  );
}
