// Validate that a string looks like a Tidal resource (full URL or shorthand).

const TYPES = ['track', 'video', 'album', 'playlist', 'artist', 'mix'];

export function tidalUrl(kind: string, id: string | number): string {
	return `https://listen.tidal.com/${kind}/${id}`;
}

export function TidalUrlIsValid(text: string): boolean {
	const t = text.trim();
	if (!t) return false;
	const segments = t.replace(/^https?:\/\/[^/]+/i, '').split(/[/?#]/).filter(Boolean);
	const idx = segments.findIndex((s) => TYPES.includes(s));
	return idx >= 0 && !!segments[idx + 1];
}
