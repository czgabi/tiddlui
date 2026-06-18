// Global keyboard shortcuts. Returns a cleanup function.
//
//   Cmd/Ctrl+K  focus search        Cmd/Ctrl+,  settings
//   Enter       download            Cmd/Ctrl+H  toggle queue
//   Cmd/Ctrl+Q  quit

export interface ShortcutHandlers {
	focusSearch: () => void;
	download: () => void;
	toggleSettings: () => void;
	toggleQueue: () => void;
	quit: () => void;
}

function isTypingTarget(el: EventTarget | null): boolean {
	if (!(el instanceof HTMLElement)) return false;
	const tag = el.tagName.toLowerCase();
	return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}

export function installShortcuts(handlers: ShortcutHandlers): () => void {
	function onKeydown(e: KeyboardEvent) {
		const mod = e.metaKey || e.ctrlKey;

		if (mod && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			handlers.focusSearch();
		} else if (mod && e.key === ',') {
			e.preventDefault();
			handlers.toggleSettings();
		} else if (mod && e.key.toLowerCase() === 'h') {
			e.preventDefault();
			handlers.toggleQueue();
		} else if (mod && e.key.toLowerCase() === 'q') {
			e.preventDefault();
			handlers.quit();
		} else if (e.key === 'Enter' && !mod && !isTypingTarget(e.target)) {
			handlers.download();
		}
	}

	window.addEventListener('keydown', onKeydown);
	return () => window.removeEventListener('keydown', onKeydown);
}
