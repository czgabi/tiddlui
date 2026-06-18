// Helper to kick off a download: registers a local queue item and tells the engine.

import { engine } from '$lib/ipc/commands';
import { downloads } from '$lib/stores/download.svelte';
import { settings } from '$lib/stores/settings.svelte';
import { ui } from '$lib/stores/ui.svelte';
import type { Quality, Resource } from '$lib/types';

export function startDownload(
	url: string,
	opts: { quality?: Quality; resource?: Resource } = {}
): string | null {
	if (!url.trim()) {
		ui.notify('Paste a Tidal link or pick a search result first.', 'error');
		return null;
	}
	const id = crypto.randomUUID();
	const quality = opts.quality ?? settings.quality;
	downloads.add({
		id,
		url,
		quality,
		status: 'queued',
		progress: 0,
		resource: opts.resource,
		cover_url: opts.resource?.cover_url ?? null,
		created_at: Date.now()
	});
	engine.enqueue({
		job_id: id,
		url,
		quality,
		output_path: settings.output_path,
		template: settings.template,
		subfolders: settings.track_subfolders
	});
	return id;
}
