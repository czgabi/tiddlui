// One place to ask "should this animate?".
//
// Two independent sources say no: the operating system's reduced-motion
// preference, and the app's own toggle. Either one wins, so a user who has set
// the OS preference never has to find the setting.

import { settings } from '$lib/stores/settings.svelte';

export function systemPrefersReducedMotion(): boolean {
	if (typeof window === 'undefined') return false;
	return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Read inside a component and it stays reactive to the setting. */
export function motionReduced(): boolean {
	return settings.reduce_motion || systemPrefersReducedMotion();
}

/** Mirror the decision onto <html> so CSS-only animations can opt out too. */
export function applyMotion(reduced: boolean): void {
	if (typeof document === 'undefined') return;
	document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
}
