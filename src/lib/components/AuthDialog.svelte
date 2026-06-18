<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { ExternalLink, Loader2, ShieldCheck } from '@lucide/svelte';
	import { openUrl } from '@tauri-apps/plugin-opener';
	import { engine } from '$lib/ipc/commands';
	import { auth } from '$lib/stores/auth.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	// Close automatically once authenticated.
	$effect(() => {
		if (auth.loggedIn && open) open = false;
	});

	function startLogin() {
		auth.error = null;
		engine.login();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="glass-strong border-white/10 sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<ShieldCheck class="size-5 text-accent-cyan" /> Sign in to Tidal
			</Dialog.Title>
			<Dialog.Description>
				Authorize with your Tidal account to search and download. Downloads use your own
				subscription.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col items-center gap-4 py-4">
			{#if auth.pending}
				<p class="text-sm text-muted-foreground">Enter this code on the Tidal page:</p>
				<div
					class="rounded-xl border border-white/10 bg-white/5 px-6 py-3 font-mono text-2xl tracking-[0.3em] text-foreground"
				>
					{auth.userCode}
				</div>
				<Button variant="secondary" onclick={() => auth.verificationUrl && openUrl(auth.verificationUrl)}>
					<ExternalLink class="size-4" /> Open authorization page
				</Button>
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 class="size-4 animate-spin" /> Waiting for authorization…
				</div>
			{:else}
				<Button onclick={startLogin} class="w-full">Start sign-in</Button>
			{/if}

			{#if auth.error}
				<p class="text-sm text-destructive">{auth.error}</p>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
