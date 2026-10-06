import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';

import { EN, FIL, type StringKey } from './strings';
import { CEB } from './bisaya';

export type Language = 'en' | 'fil' | 'ceb';
export type { StringKey };

const STORAGE_KEY = 'dahonmd-language';
const DICTIONARIES: Record<Language, Record<StringKey, string>> = { en: EN, fil: FIL, ceb: CEB };

let current: Language = 'en';
const listeners = new Set<() => void>();

/** Loads the farmer's saved language choice once at startup. */
export async function loadLanguage() {
  try {
    const saved = await SecureStore.getItemAsync(STORAGE_KEY);
    if (saved === 'en' || saved === 'fil' || saved === 'ceb') setCurrent(saved);
  } catch {
    // English stays the default when the choice cannot be read.
  }
}

export async function setLanguage(language: Language) {
  setCurrent(language);
  try { await SecureStore.setItemAsync(STORAGE_KEY, language); } catch { /* the choice still applies until restart */ }
}

function setCurrent(language: Language) {
  if (language === current) return;
  current = language;
  listeners.forEach((listener) => listener());
}

export function getLanguage() {
  return current;
}

/** Fills {name}-style placeholders. */
export function translate(language: Language, key: StringKey, vars?: Record<string, string | number>) {
  const text = DICTIONARIES[language][key] ?? EN[key];
  return vars ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : text;
}

/** Current language plus a translator; screens re-render when the farmer switches language. */
export function useT() {
  const language = useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, getLanguage, getLanguage);
  return { language, t: (key: StringKey, vars?: Record<string, string | number>) => translate(language, key, vars) };
}
