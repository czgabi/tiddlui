// Validate that a string looks like a Tidal resource (full URL or shorthand).

const TYPES = ['track', 'video', 'album', 'playlist', 'artist', 'mix'];

export function tidalUrl(kind: string, id: string | number): string {
	return `https://listen.tidal.com/${kind}/${id}`;
}

/** Pull the (kind, id) out of a full URL or a `type/id` shorthand. */
export function parseTidalResource(text: string): { kind: string; id: string } | null {
	const t = text.trim();
	if (!t) return null;
	const segments = t.replace(/^https?:\/\/[^/]+/i, '').split(/[/?#]/).filter(Boolean);
	const idx = segments.findIndex((s) => TYPES.includes(s));
	if (idx < 0 || !segments[idx + 1]) return null;
	return { kind: segments[idx], id: segments[idx + 1] };
}

export function TidalUrlIsValid(text: string): boolean {
	return parseTidalResource(text) !== null;
}
