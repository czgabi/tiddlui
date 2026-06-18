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
	// dark
	{ id: 'aurora', label: 'Aurora', dark: true, swatch: ['#0a0a0a', '#00d9ff', '#7c3aed'] },
	{ id: 'obsidian', label: 'Obsidian', dark: true, swatch: ['#000000', '#5eead4', '#818cf8'] },
	{ id: 'slate', label: 'Slate', dark: true, swatch: ['#0f1419', '#5b9dff', '#8b8bff'] },
	{ id: 'nebula', label: 'Nebula', dark: true, swatch: ['#0d0a1f', '#a855f7', '#ec4899'] },
	// light / frutiger-aero
	{ id: 'aqua', label: 'Aqua', dark: false, swatch: ['#e8f3ff', '#0ea5e9', '#3b82f6'] },
	{ id: 'verdant', label: 'Verdant', dark: false, swatch: ['#e9fbf0', '#10b981', '#34d399'] },
	{ id: 'mercury', label: 'Mercury', dark: false, swatch: ['#eef1f5', '#64748b', '#0ea5e9'] },
	{ id: 'tangerine', label: 'Tangerine', dark: false, swatch: ['#fff6ec', '#fb923c', '#f59e0b'] },
	{ id: 'paper', label: 'Paper', dark: false, swatch: ['#ffffff', '#18181b', '#a1a1aa'] }
];

export const DEFAULT_THEME = 'aurora';

export function applyTheme(id: string): void {
	if (typeof document === 'undefined') return;
	const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
	const el = document.documentElement;
	el.dataset.theme = theme.id;
	el.classList.toggle('dark', theme.dark);
}
