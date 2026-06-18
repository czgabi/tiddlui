// Small display formatters.

export function formatDuration(seconds?: number): string {
	if (!seconds || seconds < 0) return '0:00';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
	return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatSpeed(bytesPerSec?: number): string {
	if (!bytesPerSec || bytesPerSec <= 0) return '';
	const mb = bytesPerSec / (1024 * 1024);
	if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
	return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
}

export function formatPercent(p?: number): string {
	return `${Math.round((p ?? 0) * 100)}%`;
}

export function relativeDate(ts: number): string {
	const d = new Date(ts);
	const today = new Date();
	const sameDay =
		d.getFullYear() === today.getFullYear() &&
		d.getMonth() === today.getMonth() &&
		d.getDate() === today.getDate();
	if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
