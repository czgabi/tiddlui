// Shared types mirroring the engine's JSON protocol (see sidecar/serialize.py).

export type Quality = 'LOW' | 'NORMAL' | 'HIGH' | 'MAX';

export const QUALITIES: Quality[] = ['LOW', 'NORMAL', 'HIGH', 'MAX'];

export const QUALITY_LABELS: Record<Quality, string> = {
	LOW: 'Low',
	NORMAL: 'Normal',
	HIGH: 'High',
	MAX: 'Max'
};

export const QUALITY_DESC: Record<Quality, string> = {
	LOW: '96 kbps AAC',
	NORMAL: '320 kbps AAC',
	HIGH: '16-bit FLAC',
	MAX: 'Up to 24-bit Hi-Res'
};

export type ResourceKind = 'track' | 'album' | 'playlist' | 'artist';

export interface Resource {
	kind: ResourceKind;
	id: string | number;
	title: string;
	version?: string | null;
	artist: string;
	artists?: string[];
	duration?: number;
	cover_url?: string | null;
	album?: { id: number; title: string; cover_url?: string | null };
	explicit?: boolean;
	audio_quality?: string | null;
	track_number?: number;
	number_of_tracks?: number;
	year?: number | null;
	// extended track metadata (populated on resolve)
	copyright?: string | null;
	isrc?: string | null;
	bpm?: number | null;
	popularity?: number | null;
	// artist detail (populated when an artist is resolved)
	bio?: string | null;
	top_tracks?: Resource[];
	albums?: Resource[]; // artist discography
	// album detail
	review?: string | null; // editorial album review
}

export interface SearchResults {
	tracks: Resource[];
	albums: Resource[];
	playlists: Resource[];
	artists: Resource[];
	top_hit?: { type: string } | null;
}

export type JobStatus =
	| 'queued'
	| 'resolving'
	| 'downloading'
	| 'processing'
	| 'complete'
	| 'error'
	| 'cancelled';

export interface QueueItem {
	id: string;
	url: string;
	quality: Quality;
	status: JobStatus;
	progress: number;
	track_progress?: number;
	resource?: Resource;
	current_title?: string;
	current_artist?: string;
	cover_url?: string | null;
	speed_bps?: number;
	quality_label?: string;
	completed?: number;
	total?: number;
	path?: string;
	message?: string;
	created_at: number;
}

export interface AppSettings {
	output_path: string;
	template: string;
	quality: Quality;
	notify_on_complete: boolean;
	theme: string;
	track_subfolders: boolean;
	export_mp3: boolean;
	mute_by_default: boolean;
}

export interface FfmpegStatus {
	state: 'checking' | 'downloading' | 'extracting' | 'ready' | 'missing';
	progress?: number;
	message?: string;
}
