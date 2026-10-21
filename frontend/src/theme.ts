export type Theme = 'light' | 'dark';

export function getTheme(): Theme {
  return localStorage.getItem('quantx_theme') === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('quantx_theme', theme);
}

// Apply the saved preference before React renders to avoid a flash of the wrong theme.
export function initializeTheme(): void {
  document.documentElement.classList.toggle('dark', getTheme() === 'dark');
}
