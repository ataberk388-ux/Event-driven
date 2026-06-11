import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn class combiner: clsx + tailwind-merge (dedupes conflicting classes). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
