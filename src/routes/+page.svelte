<script lang="ts">
	import { onMount } from 'svelte';
	import { getCurrentWebview } from '@tauri-apps/api/webview';
	import { exit } from '@tauri-apps/plugin-process';
	import { platform } from '@tauri-apps/plugin-os';
	import { open as openDialog } from '@tauri-apps/plugin-dialog';
	import { openUrl } from '@tauri-apps/plugin-opener';
	import { Settings, Download, Square, FolderOpen, LogIn, Disc3 } from '@lucide/svelte';

	import SearchBar from '$lib/components/SearchBar.svelte';
	import MetadataPanel from '$lib/components/MetadataPanel.svelte';
	import QueueSidebar from '$lib/components/QueueSidebar.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import AuthDialog from '$lib/components/AuthDialog.svelte';
	import DuplicateDialog from '$lib/components/DuplicateDialog.svelte';
	import QualitySlider from '$lib/components/QualitySlider.svelte';
	import { Button } from '$lib/components/ui/button';

	import { downloads } from '$lib/stores/download.svelte';
	import { settings } from '$lib/stores/settings.svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { search } from '$lib/stores/search.svelte';
	import { engine } from '$lib/ipc/commands';
	import { initEngine } from '$lib/ipc/engine';
	import { startDownload } from '$lib/queue';
	import { installShortcuts } from '$lib/keyboard';
	import { TidalUrlIsValid } from '$lib/url';

	let searchBar = $state<{ focus: () => void } | null>(null);
	let settingsOpen = $state(false);
	let authOpen = $state(false);

	function go() {
		startDownload(downloads.url, { resource: downloads.selected ?? undefined });
	}

	function stop() {
		const a = downloads.active;
		if (a) engine.cancel(a.id);
	}

	async function browse() {
		const dir = await openDialog({ directory: true, defaultPath: settings.output_path || undefined });
		if (typeof dir === 'string') {
			settings.output_path = dir;
			settings.save();
		}
	}

	// Force sign-in whenever signed out — but only after the engine has reported
	// the initial auth state, so we never flash the login on a valid session.
	$effect(() => {
		if (auth.checked && !auth.loggedIn) authOpen = true;
		else if (auth.loggedIn) authOpen = false;
	});

	onMount(() => {
		let cleanupShortcuts = () => {};
		let unlistenDrop: (() => void) | undefined;

		(async () => {
			try {
				ui.isMac = (await platform()) === 'macos';
			} catch {
				/* ignore */
			}
			await settings.load();
			await initEngine();

			cleanupShortcuts = installShortcuts({
				focusSearch: () => searchBar?.focus(),
				download: go,
				toggleSettings: () => (settingsOpen = !settingsOpen),
				toggleQueue: () => (ui.queueOpen = !ui.queueOpen),
				quit: () => exit(0)
			});

			// Folder drops → output path (best effort).
			unlistenDrop = await getCurrentWebview().onDragDropEvent((e) => {
				if (e.payload.type === 'drop' && e.payload.paths.length) {
					settings.output_path = e.payload.paths[0];
					settings.save();
					ui.notify('Output folder updated');
				}
			});
		})();

		return () => {
			cleanupShortcuts();
			unlistenDrop?.();
		};
	});

	// HTML5 text drop (dragging a Tidal URL from a browser).
	function onDrop(e: DragEvent) {
		const text = e.dataTransfer?.getData('text')?.trim();
		if (text && TidalUrlIsValid(text)) {
			e.preventDefault();
			search.query = text;
			downloads.url = text;
			if (auth.loggedIn) engine.resolve(text, ++search.requestId);
		}
	}
</script>

<svelte:window
	ondragover={(e) => e.preventDefault()}
	ondrop={onDrop}
	oncontextmenu={(e) => e.preventDefault()}
/>

<div class="flex h-full flex-col gap-4 p-4">
	<!-- Header -->
	<header class="flex items-center gap-3">
		<button
			onclick={() => openUrl('https://github.com/czgabi/tiddlui')}
			title="Open the GitHub repo"
			class="flex items-center gap-2 pr-1 transition-opacity hover:opacity-80"
		>
			<Disc3 class="size-6 text-accent-cyan" />
			<span class="text-gradient text-lg font-semibold tracking-tight">Tiddlui</span>
		</button>
		<div class="flex-1"><SearchBar bind:this={searchBar} /></div>
		{#if auth.loggedIn}
			<div class="hidden text-xs text-muted-foreground sm:block">{auth.user ?? 'Signed in'}</div>
		{:else}
			<Button variant="secondary" size="sm" onclick={() => (authOpen = true)}>
				<LogIn class="size-4" /> Sign in
			</Button>
		{/if}
		<Button variant="ghost" size="icon" title="Settings ({ui.mod}+,)" onclick={() => (settingsOpen = true)}>
			<Settings class="size-5" />
		</Button>
	</header>

	<!-- Body -->
	<div class="flex min-h-0 flex-1 gap-4">
		<section class="flex min-w-0 flex-1 flex-col gap-4">
			<div class="min-h-0 flex-1"><MetadataPanel /></div>

			<!-- Controls -->
			<div class="glass flex items-center gap-4 p-4">
				<div class="flex items-center gap-2">
					<span class="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Save to</span>
					<Button variant="secondary" size="sm" onclick={browse} title="Choose where downloads are saved">
						<FolderOpen class="size-4" />
						<span class="max-w-[12rem] truncate">{settings.output_path || 'Choose folder'}</span>
					</Button>
				</div>
				<div class="flex-1"><QualitySlider bind:value={settings.quality} /></div>
				{#if downloads.active}
					<Button variant="secondary" onclick={stop}>
						<Square class="size-4" /> Stop
					</Button>
				{/if}
				<Button onclick={go} disabled={!auth.loggedIn || !downloads.url.trim()}>
					<Download class="size-4" /> Download
				</Button>
			</div>
		</section>

		<QueueSidebar />
	</div>
</div>

<!-- ffmpeg provisioning banner -->
{#if ui.ffmpeg && (ui.ffmpeg.state === 'downloading' || ui.ffmpeg.state === 'extracting')}
	<div class="glass glass-strong fixed bottom-4 left-1/2 z-50 -translate-x-1/2 px-4 py-2 text-sm">
		Preparing ffmpeg… {ui.ffmpeg.progress ? `${Math.round(ui.ffmpeg.progress * 100)}%` : ''}
	</div>
{/if}

<!-- toast -->
{#if ui.toast}
	<div
		class="fixed right-4 bottom-4 z-50 max-w-sm rounded-xl border px-4 py-2.5 text-sm backdrop-blur-md {ui
			.toast.kind === 'error'
			? 'border-destructive/40 bg-destructive/15 text-destructive-foreground'
			: 'border-foreground/10 bg-foreground/10 text-foreground'}"
	>
		{ui.toast.message}
	</div>
{/if}

<SettingsModal bind:open={settingsOpen} />
<AuthDialog bind:open={authOpen} />
<DuplicateDialog />
