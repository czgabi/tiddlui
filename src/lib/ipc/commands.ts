// Typed wrappers over Tauri commands + the engine stdio protocol.

import { invoke } from '@tauri-apps/api/core';
import type { AppSettings, Quality } from '$lib/types';

function send(payload: Record<string, unknown>): Promise<void> {
	return invoke('engine_send', { payload });
}

export interface EnqueueArgs {
	job_id: string;
	url: string;
	quality: Quality;
	output_path: string;
	template: string;
	subfolders: boolean;
}

export const engine = {
	ping: () => send({ cmd: 'ping' }),
	authStatus: () => send({ cmd: 'auth_status' }),
	login: () => send({ cmd: 'login' }),
	logout: () => send({ cmd: 'logout' }),
	search: (query: string, requestId: number) =>
		send({ cmd: 'search', query, request_id: requestId }),
	favorites: (kind: string, offset: number, requestId: number) =>
		send({ cmd: 'favorites', kind, offset, request_id: requestId }),
	resolve: (url: string, requestId: number) =>
		send({ cmd: 'resolve', url, request_id: requestId }),
	tracklist: (url: string, requestId: number) =>
		send({ cmd: 'tracklist', url, request_id: requestId }),
	enqueue: (args: EnqueueArgs) => send({ cmd: 'enqueue', ...args }),
	cancel: (jobId: string) => send({ cmd: 'cancel', job_id: jobId }),
	resolveDuplicate: (jobId: string, action: 'cancel' | 'replace' | 'version') =>
		send({ cmd: 'resolve_duplicate', job_id: jobId, action }),
	deleteFile: (path: string) => send({ cmd: 'delete_file', path }),
	saveImage: (url: string, dest: string) => send({ cmd: 'save_image', url, dest })
};

export const settingsApi = {
	load: () => invoke<AppSettings | null>('load_settings'),
	save: (settings: AppSettings) => invoke('save_settings', { settings })
};
