// "My Library" — paginated browse of the user's Tidal favorites, plus a search
// that covers the whole library at once.
//
// Browsing pages one kind at a time (cheap, what you see is what you asked
// for). Searching needs everything, so the first search pulls all four kinds in
// one engine round trip and then filters in memory — no request per keystroke.

import { engine } from '$lib/ipc/commands';
import type { Resource } from '$lib/types';

export type FavKind = 'tracks' | 'albums' | 'artists' | 'playlists';

export const FAV_KINDS: { id: FavKind; label: string }[] = [
	{ id: 'tracks', label: 'Tracks' },
	{ id: 'albums', label: 'Albums' },
	{ id: 'artists', label: 'Artists' },
	{ id: 'playlists', label: 'Playlists' }
];

export type SortId = 'added' | 'title' | 'artist';

export const SORTS: { id: SortId; label: string }[] = [
	{ id: 'added', label: 'Recently added' },
	{ id: 'title', label: 'Title' },
	{ id: 'artist', label: 'Artist' }
];

/** You follow artists rather than adding them, and they have no separate
 *  artist field to sort on. */
export function sortsFor(kind: FavKind): { id: SortId; label: string }[] {
	return SORTS.filter((s) => !(kind === 'artists' && s.id === 'artist')).map((s) =>
		s.id === 'added' && kind === 'artists' ? { ...s, label: 'Recently followed' } : s
	);
}

/** Fold case and accents so "Bjork" finds "Björk". */
function normalize(s: unknown): string {
	return String(s ?? '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** Higher is better; 0 means no match. Mirrors how the main search feels:
 *  a title that starts with the query beats one that merely contains it. */
function score(item: Resource, q: string): number {
	const title = normalize(item.title);
	const artist = normalize(item.artist);
	if (!q) return 0;

	let best = 0;
	if (title === q) best = 100;
	else if (title.startsWith(q)) best = 80;
	else if (title.includes(q)) best = 60;

	if (artist === q) best = Math.max(best, 70);
	else if (artist.startsWith(q)) best = Math.max(best, 55);
	else if (artist.includes(q)) best = Math.max(best, 40);

	// every word present, in any order ("daft discovery")
	if (!best) {
		const words = q.split(' ').filter(Boolean);
		const hay = `${title} ${artist}`;
		if (words.length > 1 && words.every((w) => hay.includes(w))) best = 30;
	}
	return best;
}

class LibraryStore {
	open = $state(false);
	kind = $state<FavKind>('tracks');
	items = $state<Resource[]>([]);
	total = $state(0);
	loading = $state(false);
	sort = $state<SortId>('added');
	// monotonic id so stale paginated responses are ignored
	requestId = $state(0);

	// playlist folder tree: Tidal lets playlists be filed into folders, which the
	// flat favourites list can't represent. Browsing Playlists walks that tree.
	folderId = $state('root');
	folderTrail = $state<{ id: string; title: string }[]>([]);

	// whole-library search
	searching = $state(false);
	query = $state('');
	all = $state<Record<FavKind, Resource[]> | null>(null);
	loadingAll = $state(false);

	get canLoadMore(): boolean {
		// A folder level arrives whole; only the flat favourite lists page.
		return this.kind !== 'playlists' && this.items.length < this.total;
	}

	/** The browse list, in the chosen order. Sorting is client-side, so it only
	 *  orders what has been paged in so far. */
	get sorted(): Resource[] {
		const list = [...this.items];
		if (this.sort === 'title') {
			list.sort((a, b) => normalize(a.title).localeCompare(normalize(b.title)));
		} else if (this.sort === 'artist') {
			list.sort(
				(a, b) =>
					normalize(a.artist).localeCompare(normalize(b.artist)) ||
					normalize(a.title).localeCompare(normalize(b.title))
			);
		}
		return list; // 'added' is the order Tidal returned
	}

	/** Search hits grouped by kind, best first, mirroring the main search. */
	get results(): { kind: FavKind; label: string; items: Resource[] }[] {
		const q = normalize(this.query);
		if (!q || !this.all) return [];
		return FAV_KINDS.map(({ id, label }) => ({
			kind: id,
			label,
			items: (this.all![id] ?? [])
				.map((item) => ({ item, s: score(item, q) }))
				.filter((x) => x.s > 0)
				.sort((a, b) => b.s - a.s)
				.slice(0, 8)
				.map((x) => x.item)
		})).filter((g) => g.items.length > 0);
	}

	get resultCount(): number {
		return this.results.reduce((n, g) => n + g.items.length, 0);
	}

	openModal() {
		this.open = true;
		this.show(this.kind);
	}

	get sortLabel(): string {
		return sortsFor(this.kind).find((s) => s.id === this.sort)?.label ?? 'Recently added';
	}

	/** Switch tab (or (re)load the current one) from the first page. */
	show(kind: FavKind) {
		this.kind = kind;
		// 'artist' has no meaning on the artists tab; fall back rather than
		// leaving the dropdown showing an option it no longer lists.
		if (kind === 'artists' && this.sort === 'artist') this.sort = 'added';
		if (kind !== 'playlists') {
			this.folderId = 'root';
			this.folderTrail = [];
		}
		this.items = [];
		this.total = 0;
		this.#load(0);
	}

	/** Called as the list nears its end. Guarded so a burst of scroll events
	 *  can't fire several overlapping page requests. */
	loadMore() {
		if (this.loading || !this.canLoadMore) return;
		this.#load(this.items.length);
	}

	#load(offset: number) {
		this.loading = true;
		if (this.kind === 'playlists') {
			// The folder endpoint returns one whole level, so it never pages.
			engine.playlistFolders(this.folderId, ++this.requestId);
		} else {
			engine.favorites(this.kind, offset, ++this.requestId);
		}
	}

	/** Walk into a folder, remembering the way back. */
	openFolder(item: Resource) {
		this.folderTrail = [...this.folderTrail, { id: this.folderId, title: item.title }];
		this.folderId = String(item.id);
		this.items = [];
		this.total = 0;
		this.#load(0);
	}

	/** Back out one level of the folder tree. */
	leaveFolder() {
		const prev = this.folderTrail.pop();
		this.folderTrail = [...this.folderTrail];
		this.folderId = prev?.id ?? 'root';
		this.items = [];
		this.total = 0;
		this.#load(0);
	}

	get folderName(): string {
		return this.folderTrail.length
			? this.folderTrail[this.folderTrail.length - 1].title
			: '';
	}

	/** Fed by the engine "playlist_folders" event. */
	receiveFolder(ev: {
		request_id?: number;
		items?: Resource[];
		total?: number;
		[k: string]: unknown;
	}) {
		if (ev.request_id !== this.requestId) return;
		this.items = ev.items ?? [];
		this.total = ev.total ?? this.items.length;
		this.loading = false;
	}

	/** Fed by the engine "favorites" event. */
	receive(ev: {
		request_id?: number;
		kind?: string;
		items?: Resource[];
		total?: number;
		offset?: number;
		[k: string]: unknown;
	}) {
		if (ev.request_id !== this.requestId || ev.kind !== this.kind) return;
		const incoming = ev.items ?? [];
		this.items = ev.offset === 0 ? incoming : [...this.items, ...incoming];
		this.total = ev.total ?? this.items.length;
		this.loading = false;
	}

	/** Open the search field, pulling the whole library the first time. */
	startSearch() {
		this.searching = true;
		if (this.all || this.loadingAll) return;
		this.loadingAll = true;
		engine.favoritesAll(++this.requestId);
	}

	endSearch() {
		this.searching = false;
		this.query = '';
	}

	/** Fed by the engine "favorites_all" event. */
	receiveAll(ev: { [k: string]: unknown }) {
		this.all = {
			tracks: (ev.tracks as Resource[]) ?? [],
			albums: (ev.albums as Resource[]) ?? [],
			artists: (ev.artists as Resource[]) ?? [],
			playlists: (ev.playlists as Resource[]) ?? []
		};
		this.loadingAll = false;
	}

	reset() {
		this.open = false;
		this.items = [];
		this.total = 0;
		this.loading = false;
		this.all = null;
		this.loadingAll = false;
		this.folderId = 'root';
		this.folderTrail = [];
		this.endSearch();
	}
}

export const library = new LibraryStore();
