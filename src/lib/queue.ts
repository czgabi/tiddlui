// Helpers to kick off a download: register a local queue item and tell the engine.

import { engine } from '$lib/ipc/commands';
import { downloads } from '$lib/stores/download.svelte';
import { settings } from '$lib/stores/settings.svelte';
import { ui } from '$lib/stores/ui.svelte';
import { tidalUrl } from '$lib/url';
import type { Quality, QueueItem, Resource } from '$lib/types';

export function startDownload(
	url: string,
	opts: { quality?: Quality; resource?: Resource; force?: boolean } = {}
): string | null {
	const target = url.trim();
	if (!target) {
		ui.notify('Paste a Tidal link or pick a search result first.', 'error');
		return null;
	}
	// Don't queue the same thing twice (unless explicitly re-downloading).
	if (!opts.force && downloads.items.some((i) => i.url === target)) {
		ui.notify('That’s already in your queue or history.', 'info');
		return null;
	}
	const id = crypto.randomUUID();
	const quality = opts.quality ?? settings.quality;
	downloads.add({
		id,
		url: target,
		quality,
		status: 'queued',
		progress: 0,
		resource: opts.resource,
		cover_url: opts.resource?.cover_url ?? null,
		created_at: Date.now()
	});
	engine.enqueue({
		job_id: id,
		url: target,
		quality,
		output_path: settings.output_path,
		template: settings.template,
		subfolders: settings.track_subfolders,
		mp3: settings.export_mp3,
		concurrency: settings.download_concurrency
	});
	return id;
}

/** Re-run a finished entry: drop the old row so it isn't duplicated, queue it again. */
export function retryDownload(item: QueueItem): void {
	downloads.remove(item.id);
	startDownload(item.url, { quality: item.quality, resource: item.resource, force: true });
}

/** Queue just the tracks that failed inside a group, individually. */
export function retryFailedTracks(item: QueueItem): number {
	const tracks = item.failed_tracks ?? [];
	let queued = 0;
	for (const t of tracks) {
		if (startDownload(tidalUrl('track', t.id), { force: true })) queued++;
	}
	if (queued) {
		// The failures have been handed to new jobs; clear them off the old row.
		downloads.update(item.id, { failed: 0, failed_tracks: [] });
		ui.notify(`Retrying ${queued} track${queued === 1 ? '' : 's'}`);
	}
	return queued;
}

/** Re-run every failed or cancelled entry in the history. */
export function retryAllFailed(): number {
	const targets = downloads.items.filter(
		(i) => i.status === 'error' || i.status === 'cancelled'
	);
	for (const item of targets) retryDownload(item);
	if (targets.length) {
		ui.notify(`Retrying ${targets.length} download${targets.length === 1 ? '' : 's'}`);
	}
	return targets.length;
}
