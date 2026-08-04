/** Мінімальний i18n-шар. Наразі лише uk; структура готова до ru/en. */
import { uk, type Dictionary } from './uk';

const dictionaries: Record<string, Dictionary> = { uk };

let current: Dictionary = uk;

export function setLocale(locale: string): void {
  current = dictionaries[locale] ?? uk;
}

export function t(): Dictionary {
  return current;
}

export { uk };
export type { Dictionary };
