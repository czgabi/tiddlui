// "My Library" — paginated browse of the user's Tidal favorites.

import { engine } from '$lib/ipc/commands';
import type { Resource } from '$lib/types';

export type FavKind = 'tracks' | 'albums' | 'artists' | 'playlists';

export const FAV_KINDS: { id: FavKind; label: string }[] = [
	{ id: 'tracks', label: 'Tracks' },
	{ id: 'albums', label: 'Albums' },
	{ id: 'artists', label: 'Artists' },
	{ id: 'playlists', label: 'Playlists' }
];

class LibraryStore {
	open = $state(false);
	kind = $state<FavKind>('tracks');
	items = $state<Resource[]>([]);
	total = $state(0);
	loading = $state(false);
	// monotonic id so stale paginated responses are ignored
	requestId = $state(0);

	get canLoadMore(): boolean {
		return this.items.length < this.total;
	}

	openModal() {
		this.open = true;
		this.show(this.kind);
	}

	/** Switch tab (or (re)load the current one) from the first page. */
	show(kind: FavKind) {
		this.kind = kind;
		this.items = [];
		this.total = 0;
		this.#load(0);
	}

	loadMore() {
		if (!this.loading && this.canLoadMore) this.#load(this.items.length);
	}

	#load(offset: number) {
		this.loading = true;
		engine.favorites(this.kind, offset, ++this.requestId);
	}

	/** Fed by the engine "favorites" event. */
	receive(ev: { request_id?: number; kind?: string; items?: Resource[]; total?: number; offset?: number; [k: string]: unknown }) {
		if (ev.request_id !== this.requestId || ev.kind !== this.kind) return;
		const incoming = ev.items ?? [];
		this.items = ev.offset === 0 ? incoming : [...this.items, ...incoming];
		this.total = ev.total ?? this.items.length;
		this.loading = false;
	}

	reset() {
		this.open = false;
		this.items = [];
		this.total = 0;
		this.loading = false;
	}
}

export const library = new LibraryStore();
