// Output-path template presets + a client-side preview matching tiddl's fields.

export interface TemplatePreset {
	label: string;
	value: string;
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
	{ label: 'Artist / Album / Title', value: '{album.artist}/{album.title}/{item.title}' },
	{
		label: 'Artist / Album / 01. Title',
		value: '{album.artist}/{album.title}/{item.number:02d}. {item.title}'
	},
	{ label: 'Playlist / 01. Title', value: '{playlist.title}/{item.number:02d}. {item.title}' },
	{ label: 'Artist - Title', value: '{album.artist} - {item.title}' }
];

// Sample data used only to render a human-readable preview path.
const SAMPLE: Record<string, string | number> = {
	'album.artist': 'Daft Punk',
	'album.title': 'Discovery',
	'item.title': 'One More Time',
	'item.number': 1,
	'item.artist': 'Daft Punk',
	'playlist.title': 'Workout Mix',
	'playlist.index': 1
};

/** Best-effort preview; the engine performs the authoritative formatting. */
export function previewTemplate(template: string): string {
	const filled = template.replace(/\{([^}:]+)(?::([^}]+))?\}/g, (_, token: string, spec?: string) => {
		const value = SAMPLE[token.trim()];
		if (value === undefined) return `{${token}}`;
		if (spec && /^0\d*d$/.test(spec) && typeof value === 'number') {
			const width = parseInt(spec.replace(/[^\d]/g, ''), 10) || 2;
			return String(value).padStart(width, '0');
		}
		return String(value);
	});
	return filled + '.flac';
}
