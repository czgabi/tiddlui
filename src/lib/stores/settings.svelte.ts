// Persisted user preferences (output path, template, quality, notifications).

import { audioDir, join } from '@tauri-apps/api/path';
import { settingsApi } from '$lib/ipc/commands';
import { applyTheme, DEFAULT_THEME } from '$lib/themes';
import type { AppSettings, Quality } from '$lib/types';

export const DEFAULT_TEMPLATE = '{album.artist}/{album.title}/{item.title}';

class SettingsStore {
	output_path = $state('');
	template = $state(DEFAULT_TEMPLATE);
	quality = $state<Quality>('HIGH');
	notify_on_complete = $state(true);
	theme = $state(DEFAULT_THEME);
	track_subfolders = $state(false);
	export_mp3 = $state(false);
	mute_by_default = $state(false);
	loaded = $state(false);

	async load() {
		const saved = await settingsApi.load().catch(() => null);
		if (saved) {
			this.output_path = saved.output_path ?? '';
			this.template = saved.template || DEFAULT_TEMPLATE;
			this.quality = saved.quality ?? 'HIGH';
			this.notify_on_complete = saved.notify_on_complete ?? true;
			this.theme = saved.theme ?? DEFAULT_THEME;
			this.track_subfolders = saved.track_subfolders ?? false;
				this.export_mp3 = saved.export_mp3 ?? false;
				this.mute_by_default = saved.mute_by_default ?? false;
		}
		applyTheme(this.theme);
		if (!this.output_path) {
			try {
				this.output_path = await join(await audioDir(), 'tiddl');
			} catch {
				this.output_path = '';
			}
		}
		this.loaded = true;
	}

	setTheme(id: string) {
		this.theme = id;
		applyTheme(id);
		this.save();
	}

	toJSON(): AppSettings {
		return {
			output_path: this.output_path,
			template: this.template,
			quality: this.quality,
			notify_on_complete: this.notify_on_complete,
			theme: this.theme,
			track_subfolders: this.track_subfolders,
			export_mp3: this.export_mp3,
			mute_by_default: this.mute_by_default
		};
	}

	async save() {
		if (!this.loaded) return;
		await settingsApi.save(this.toJSON()).catch(() => {});
	}
}

export const settings = new SettingsStore();
