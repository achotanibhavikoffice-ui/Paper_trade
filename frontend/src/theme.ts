export type Theme = 'light' | 'dark' | 'system';

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function setEffectiveTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && systemPrefersDark()));
  document.documentElement.dataset.theme = theme;
}

export function getTheme(): Theme {
  const stored = localStorage.getItem('quantx_theme');
  return stored === 'dark' || stored === 'system' ? stored : 'light';
}

export function applyTheme(theme: Theme): void {
  localStorage.setItem('quantx_theme', theme);
  setEffectiveTheme(theme);
}

// Apply the saved preference before React renders to avoid a flash of the wrong theme.
export function initializeTheme(): void {
  const preference = getTheme();
  setEffectiveTheme(preference);
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener('change', () => {
    if (getTheme() === 'system') setEffectiveTheme('system');
  });
}
