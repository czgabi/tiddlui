// Tidal search dropdown state.

import type { SearchResults } from '$lib/types';

class SearchStore {
	query = $state('');
	results = $state<SearchResults | null>(null);
	loading = $state(false);
	open = $state(false);

	// monotonically increasing id so stale responses are ignored
	requestId = $state(0);

	get hasResults(): boolean {
		const r = this.results;
		return !!r && (r.tracks.length + r.albums.length + r.playlists.length + r.artists.length > 0);
	}

	clear() {
		this.results = null;
		this.open = false;
		this.loading = false;
	}
}

export const search = new SearchStore();
