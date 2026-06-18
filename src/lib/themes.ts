// Theme registry + applier. Themes reskin the app by setting `data-theme` on
// <html> (CSS handles the rest). `.dark` is toggled for dark themes so
// shadcn's dark: utility variants apply correctly.

export interface ThemeDef {
	id: string;
	label: string;
	dark: boolean;
	/** [background, accent A, accent B] for the swatch preview */
	swatch: [string, string, string];
}

export const THEMES: ThemeDef[] = [
	{ id: 'aurora', label: 'Aurora', dark: true, swatch: ['#0a0a0a', '#00d9ff', '#7c3aed'] },
	{ id: 'dark', label: 'Slate', dark: true, swatch: ['#0f1419', '#5b9dff', '#8b8bff'] },
	{ id: 'ultradark', label: 'Ultradark', dark: true, swatch: ['#000000', '#5eead4', '#3f3f46'] },
	{ id: 'aero', label: 'Aero', dark: false, swatch: ['#e8f3ff', '#06b6d4', '#10b981'] },
	{ id: 'paper', label: 'Paper', dark: false, swatch: ['#ffffff', '#18181b', '#a1a1aa'] },
	{ id: 'citrus', label: 'Citrus', dark: false, swatch: ['#fff8f1', '#fb923c', '#14b8a6'] }
];

export const DEFAULT_THEME = 'aurora';

export function applyTheme(id: string): void {
	if (typeof document === 'undefined') return;
	const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
	const el = document.documentElement;
	el.dataset.theme = theme.id;
	el.classList.toggle('dark', theme.dark);
}
