import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

const baseControl =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;
export function Input({ className, ...props }: InputProps) {
  return <input className={cn(baseControl, className)} {...props} />;
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;
export function Select({ className, ...props }: SelectProps) {
  return <select className={cn(baseControl, className)} {...props} />;
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;
export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cn(baseControl, className)} {...props} />;
}
