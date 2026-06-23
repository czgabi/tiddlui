// Download queue, history and the currently-selected resource (AlbumCard).

import type { QueueItem, Resource } from '$lib/types';

const HISTORY_LIMIT = 20;
const DONE = new Set(['complete', 'error', 'cancelled']);

class DownloadStore {
	items = $state<QueueItem[]>([]);
	// resource shown in the metadata panel + the URL bound to the input
	selected = $state<Resource | null>(null);
	// breadcrumb of ancestors we drilled through (last = immediate parent), for "back"
	trail = $state<Resource[]>([]);
	url = $state('');
	// track listing for the selected album/playlist (metadata panel)
	tracklist = $state<Resource[]>([]);
	tracklistUrl = $state<string | null>(null);

	/** The resource a "back" would return to, if any. */
	get backTarget(): Resource | null {
		return this.trail.length ? this.trail[this.trail.length - 1] : null;
	}

	/** Select a fresh resource (search, queue, URL) — clears any drill-in trail. */
	select(resource: Resource | null) {
		this.selected = resource;
		this.trail = [];
	}

	/** Drill from the current resource into a child, remembering the way back. */
	drillInto(child: Resource) {
		if (this.selected) this.trail = [...this.trail, this.selected];
		this.selected = child;
	}

	/** Step back to the previous resource in the trail. */
	back() {
		if (!this.trail.length) return;
		const prev = this.trail[this.trail.length - 1];
		this.trail = this.trail.slice(0, -1);
		this.selected = prev;
	}

	add(item: QueueItem) {
		this.items.unshift(item);
	}

	/** Merge an engine job_update into the matching queue item. */
	update(id: string, patch: Partial<QueueItem>) {
		const item = this.items.find((i) => i.id === id);
		if (item) Object.assign(item, patch);
	}

	remove(id: string) {
		this.items = this.items.filter((i) => i.id !== id);
	}

	/** Remove finished/failed/cancelled items (the History section). */
	clearHistory() {
		this.items = this.items.filter((i) => !DONE.has(i.status));
	}

	get active(): QueueItem | undefined {
		return this.items.find((i) => !DONE.has(i.status));
	}

	get downloading(): QueueItem[] {
		return this.items.filter((i) => i.status === 'downloading' || i.status === 'resolving' || i.status === 'processing');
	}

	get queued(): QueueItem[] {
		return this.items.filter((i) => i.status === 'queued');
	}

	get history(): QueueItem[] {
		return this.items.filter((i) => DONE.has(i.status)).slice(0, HISTORY_LIMIT);
	}
}

export const downloads = new DownloadStore();
