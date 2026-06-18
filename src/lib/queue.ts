// Helper to kick off a download: registers a local queue item and tells the engine.

import { engine } from '$lib/ipc/commands';
import { downloads } from '$lib/stores/download.svelte';
import { settings } from '$lib/stores/settings.svelte';
import { ui } from '$lib/stores/ui.svelte';
import type { Quality, Resource } from '$lib/types';

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
		subfolders: settings.track_subfolders
	});
	return id;
}
