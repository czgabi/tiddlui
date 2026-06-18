<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { ExternalLink, ShieldCheck } from '@lucide/svelte';
	import { openUrl } from '@tauri-apps/plugin-opener';
	import { engine } from '$lib/ipc/commands';
	import { auth } from '$lib/stores/auth.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const R = 16;
	const C = 2 * Math.PI * R;
	let seconds = $state(3);
	let autoOpened = false;
	let loginStarted = false;

	function openTidal() {
		if (auth.verificationUrl?.startsWith('https://')) openUrl(auth.verificationUrl);
	}

	// Auto-start the device flow when the dialog opens while signed out.
	$effect(() => {
		if (open && !auth.loggedIn && !auth.pending && !auth.error && !loginStarted) {
			loginStarted = true;
			engine.login();
		}
		if (!open || auth.loggedIn) loginStarted = false;
	});

	// Once we have a verification link, count down 3s then open the browser.
	$effect(() => {
		if (auth.pending && auth.verificationUrl && !autoOpened) {
			autoOpened = true;
			seconds = 3;
			const iv = setInterval(() => {
				seconds -= 1;
				if (seconds <= 0) {
					clearInterval(iv);
					openTidal();
				}
			}, 1000);
		}
		if (!auth.pending) autoOpened = false;
	});

	// Close automatically once authenticated.
	$effect(() => {
		if (auth.loggedIn && open) open = false;
	});
</script>

<Dialog.Root
	{open}
	onOpenChange={(v) => {
		// Force sign-in: can't dismiss while signed out.
		open = v || auth.loggedIn;
	}}
>
	<Dialog.Content
		class="glass-strong border-foreground/10 sm:max-w-md"
		interactOutsideBehavior="ignore"
		escapeKeydownBehavior="ignore"
	>
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<ShieldCheck class="size-5 text-accent-cyan" /> Sign in to Tidal
			</Dialog.Title>
			<Dialog.Description>
				Authorize with your Tidal account to search and download. Uses your own subscription.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col items-center gap-4 py-4">
			{#if auth.pending}
				<p class="text-sm text-muted-foreground">Enter this code on the Tidal page:</p>
				<div class="rounded-xl border border-foreground/10 bg-foreground/5 px-6 py-3 font-mono text-2xl tracking-[0.3em] text-foreground">
					{auth.userCode}
				</div>

				<!-- countdown ring -->
				<div class="relative size-16">
					<svg viewBox="0 0 36 36" class="size-16 -rotate-90">
						<circle cx="18" cy="18" r={R} fill="none" stroke="var(--border)" stroke-width="2.5" />
						<circle
							cx="18"
							cy="18"
							r={R}
							fill="none"
							stroke="var(--accent-cyan)"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-dasharray={C}
							stroke-dashoffset={C * (1 - seconds / 3)}
							style="transition: stroke-dashoffset 1s linear"
						/>
					</svg>
					<span class="absolute inset-0 grid place-items-center text-lg font-semibold text-foreground">
						{seconds}
					</span>
				</div>
				<p class="text-xs text-muted-foreground">
					Opening your browser… or open it now:
				</p>
				<Button variant="secondary" onclick={openTidal}>
					<ExternalLink class="size-4" /> Open authorization page
				</Button>
			{:else}
				<p class="text-sm text-muted-foreground">Starting sign-in…</p>
			{/if}

			{#if auth.error}
				<p class="text-sm text-destructive">{auth.error}</p>
				<Button onclick={() => { auth.error = null; loginStarted = false; }}>Try again</Button>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
