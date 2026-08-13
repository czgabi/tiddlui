// Download queue, history and the currently-selected resource (AlbumCard).
//
// The queue survives a restart: it is written to queue.json on every status
// transition (never on progress ticks, so an active download doesn't churn the
// disk). Items are slimmed before saving — a resolved artist carries its whole
// discography, which has no business in a queue file.

import { queueApi } from '$lib/ipc/commands';
import type { QueueItem, Resource } from '$lib/types';

const HISTORY_LIMIT = 100;
const DONE = new Set(['complete', 'error', 'cancelled']);
const SAVE_DEBOUNCE = 400;

/** Just enough of a resource to render a queue row. */
function slimResource(r?: Resource): Resource | undefined {
	if (!r) return undefined;
	return {
		kind: r.kind,
		id: r.id,
		title: r.title,
		artist: r.artist,
		cover_url: r.cover_url ?? null
	};
}

/** Drop live-only fields (progress, speed) so the stored record stays small. */
function slim(i: QueueItem): QueueItem {
	return {
		id: i.id,
		url: i.url,
		quality: i.quality,
		status: i.status,
		progress: DONE.has(i.status) ? i.progress : 0,
		resource: slimResource(i.resource),
		cover_url: i.cover_url ?? null,
		quality_label: i.quality_label,
		completed: i.completed,
		total: i.total,
		failed: i.failed,
		failed_tracks: i.failed_tracks,
		path: i.path,
		message: i.message,
		created_at: i.created_at
	};
}

/** A download can't survive the app closing, so restore it as retryable. */
function restore(i: QueueItem): QueueItem {
	if (DONE.has(i.status)) return i;
	return { ...i, status: 'error', progress: 0, message: 'Interrupted — app was closed' };
}

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

	#saveTimer: ReturnType<typeof setTimeout> | undefined;
	#loaded = false;

	/** Read the persisted queue. Call once at startup. */
	async load() {
		const saved = await queueApi.load().catch(() => null);
		if (Array.isArray(saved)) {
			this.items = saved.filter((i) => i && i.id && i.url).map(restore);
		}
		this.#loaded = true;
	}

	#persist() {
		if (!this.#loaded) return; // don't overwrite the file before it's read
		clearTimeout(this.#saveTimer);
		this.#saveTimer = setTimeout(() => {
			queueApi.save(this.items.slice(0, HISTORY_LIMIT).map(slim)).catch(() => {});
		}, SAVE_DEBOUNCE);
	}

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
		this.#persist();
	}

	/** Merge an engine job_update into the matching queue item. Only a status
	 *  change triggers a save — progress ticks arrive several times a second. */
	update(id: string, patch: Partial<QueueItem>) {
		const item = this.items.find((i) => i.id === id);
		if (!item) return;
		const before = item.status;
		Object.assign(item, patch);
		if (patch.status && patch.status !== before) this.#persist();
	}

	remove(id: string) {
		this.items = this.items.filter((i) => i.id !== id);
		this.#persist();
	}

	/** Remove finished/failed/cancelled items (the History section). */
	clearHistory() {
		this.items = this.items.filter((i) => !DONE.has(i.status));
		this.#persist();
	}

	/** Drop everything (used when signing out) and clear the stored copy too. */
	reset() {
		this.items = [];
		this.#persist();
	}

	get active(): QueueItem | undefined {
		return this.items.find((i) => !DONE.has(i.status));
	}

	get downloading(): QueueItem[] {
		return this.items.filter(
			(i) => i.status === 'downloading' || i.status === 'resolving' || i.status === 'processing'
		);
	}

	get queued(): QueueItem[] {
		return this.items.filter((i) => i.status === 'queued');
	}

	get history(): QueueItem[] {
		return this.items.filter((i) => DONE.has(i.status)).slice(0, HISTORY_LIMIT);
	}

	/** History entries that can be re-run (failed outright, or partly failed). */
	get retryable(): QueueItem[] {
		return this.items.filter(
			(i) => i.status === 'error' || i.status === 'cancelled' || (i.failed ?? 0) > 0
		);
	}
}

export const downloads = new DownloadStore();
