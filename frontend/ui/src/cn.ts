import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and lets later Tailwind classes win over earlier ones (for example w-52 over w-full). */
export const cn = (...v: ClassValue[]) => twMerge(clsx(v));
