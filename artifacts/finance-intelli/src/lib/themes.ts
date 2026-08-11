export const THEME_STORAGE_KEY = 'finance-intelli-theme';

export const appThemes = [
  { id: 'obsidian', name: 'Obsidian Ember', description: 'Cinematic black with confident crimson accents.', mode: 'Dark', colors: ['#090909', '#ef233c', '#f5f5f5'] },
  { id: 'midnight', name: 'Midnight Cobalt', description: 'Deep navy with crisp electric-blue details.', mode: 'Dark', colors: ['#080d1a', '#3b82f6', '#dbeafe'] },
  { id: 'emerald', name: 'Emerald Vault', description: 'Private-banking green with restrained gold.', mode: 'Dark', colors: ['#07140f', '#10b981', '#d4a853'] },
  { id: 'violet', name: 'Violet Dusk', description: 'Rich aubergine with luminous violet highlights.', mode: 'Dark', colors: ['#130b1c', '#a855f7', '#f0d9ff'] },
  { id: 'sandstone', name: 'Sandstone Ledger', description: 'Warm editorial cream with terracotta ink.', mode: 'Light', colors: ['#f6f0e6', '#c45d35', '#302820'] },
  { id: 'paper', name: 'Paper & Ink', description: 'Minimal white, sharp charcoal, and modern cobalt.', mode: 'Light', colors: ['#f7f8fa', '#2457d6', '#17191f'] },
  { id: 'ocean', name: 'Ocean Glass', description: 'Airy sea-glass surfaces with refined teal.', mode: 'Light', colors: ['#eaf7f7', '#0f8c8c', '#12343b'] },
  { id: 'rose', name: 'Rose Noir', description: 'Burgundy depth with champagne-rose accents.', mode: 'Dark', colors: ['#170b10', '#e56b8a', '#f5d7c8'] },
] as const;

export type AppThemeId = (typeof appThemes)[number]['id'];

export function isAppTheme(value: string | null): value is AppThemeId {
  return appThemes.some((theme) => theme.id === value);
}

export function resolveTheme(profileTheme?: string): AppThemeId {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (isAppTheme(stored)) return stored;
  if (profileTheme === 'light') return 'paper';
  if (profileTheme === 'dark') return 'obsidian';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'paper' : 'obsidian';
}

export function applyTheme(theme: AppThemeId) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', appThemes.find((item) => item.id === theme)?.mode === 'Dark');
  root.style.colorScheme = appThemes.find((item) => item.id === theme)?.mode.toLowerCase() ?? 'dark';
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}
