// Transient UI state: panels, engine status, toasts, platform.

import type { FfmpegStatus } from '$lib/types';

class UiStore {
	queueOpen = $state(true);
	settingsOpen = $state(false);
	engineReady = $state(false);
	ffmpeg = $state<FfmpegStatus | null>(null);
	toast = $state<{ message: string; kind: 'info' | 'error' } | null>(null);
	isMac = $state(false);

	get mod(): string {
		return this.isMac ? '⌘' : 'Ctrl';
	}

	notify(message: string, kind: 'info' | 'error' = 'info') {
		this.toast = { message, kind };
		setTimeout(() => {
			if (this.toast?.message === message) this.toast = null;
		}, 4000);
	}
}

export const ui = new UiStore();
