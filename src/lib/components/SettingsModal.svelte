<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import { FolderOpen, LogOut } from '@lucide/svelte';
	import { open as openDialog } from '@tauri-apps/plugin-dialog';

	import { settings } from '$lib/stores/settings.svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { engine } from '$lib/ipc/commands';
	import { TEMPLATE_PRESETS, previewTemplate } from '$lib/templates';
	import { THEMES } from '$lib/themes';
	import { APP_NAME, APP_VERSION, APP_AUTHOR, APP_TAGLINE } from '$lib/about';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let custom = $state(false);
	$effect(() => {
		// non-standard saved template → start in custom (editable) mode
		if (settings.loaded && !TEMPLATE_PRESETS.some((p) => p.value === settings.template)) {
			custom = true;
		}
	});

	const presetValue = $derived(
		TEMPLATE_PRESETS.find((p) => p.value === settings.template)?.value ?? 'custom'
	);
	const selectValue = $derived(custom ? 'custom' : presetValue);
	const selectLabel = $derived(
		custom ? 'Custom' : (TEMPLATE_PRESETS.find((p) => p.value === presetValue)?.label ?? 'Custom')
	);
	const currentTheme = $derived(THEMES.find((t) => t.id === settings.theme) ?? THEMES[0]);

	async function browse() {
		const dir = await openDialog({ directory: true, defaultPath: settings.output_path || undefined });
		if (typeof dir === 'string') {
			settings.output_path = dir;
			settings.save();
		}
	}

	function onPreset(value: string) {
		if (value === 'custom') {
			custom = true;
		} else {
			custom = false;
			settings.template = value;
			settings.save();
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="glass-strong border-foreground/10 w-full sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Settings</Dialog.Title>
			<Dialog.Description>Preferences are saved automatically.</Dialog.Description>
		</Dialog.Header>

		<div class="flex max-h-[70vh] flex-col gap-5 overflow-x-hidden overflow-y-auto px-2 py-2">
			<!-- Output folder -->
			<div class="flex flex-col gap-2">
				<Label class="text-xs tracking-wide text-muted-foreground uppercase">Download folder</Label>
				<p class="text-xs text-muted-foreground">Where your downloads are saved on disk.</p>
				<div class="flex gap-2">
					<Input value={settings.output_path} readonly class="min-w-0 flex-1 font-mono text-xs" />
					<Button variant="secondary" size="sm" onclick={browse}>
						<FolderOpen class="size-4" /> Browse
					</Button>
				</div>
			</div>

			<!-- Template -->
			<div class="flex flex-col gap-2">
				<Label class="text-xs tracking-wide text-muted-foreground uppercase">Filename template</Label>
				<Select.Root type="single" value={selectValue} onValueChange={onPreset}>
					<Select.Trigger class="w-full">{selectLabel}</Select.Trigger>
					<Select.Content>
						{#each TEMPLATE_PRESETS as p (p.value)}
							<Select.Item value={p.value} label={p.label}>{p.label}</Select.Item>
						{/each}
						<Select.Item value="custom" label="Custom">Custom…</Select.Item>
					</Select.Content>
				</Select.Root>
				<Input
					bind:value={settings.template}
					readonly={!custom}
					oninput={() => custom && settings.save()}
					class="font-mono text-xs {custom ? '' : 'opacity-60'}"
					spellcheck={false}
				/>
				{#if custom}
					<p class="text-xs text-muted-foreground">
						Fields: <span class="text-accent-cyan">{'{album.artist}'}</span>, {'{album.title}'},
						{'{item.title}'}, {'{item.number}'}, {'{item.artist}'}, {'{playlist.title}'}. Use
						<span class="text-accent-cyan">/</span> for folders, pad numbers like
						<span class="text-accent-cyan">{'{item.number:02d}'}</span>.
					</p>
				{/if}
				<p class="truncate text-xs text-muted-foreground">
					Preview: <span class="text-accent-cyan">{previewTemplate(settings.template)}</span>
				</p>
			</div>

			<!-- Subfolder toggle -->
			<div class="flex items-center justify-between gap-4">
				<div>
					<Label for="subfolders" class="text-sm">Subfolder for each track</Label>
					<p class="text-xs text-muted-foreground">
						Single tracks get their own folder (albums &amp; playlists always do).
					</p>
				</div>
				<Switch
					id="subfolders"
					bind:checked={settings.track_subfolders}
					onCheckedChange={() => settings.save()}
				/>
			</div>

			<!-- MP3 export -->
			<div class="flex items-center justify-between gap-4">
				<div>
					<Label for="mp3" class="text-sm">Convert to MP3</Label>
					<p class="text-xs text-muted-foreground">
						Smaller 320&nbsp;kbps files for size-limited devices, at the cost of quality.
					</p>
				</div>
				<Switch id="mp3" bind:checked={settings.export_mp3} onCheckedChange={() => settings.save()} />
			</div>

			<!-- Mute by default -->
			<div class="flex items-center justify-between gap-4">
				<div>
					<Label for="muteDefault" class="text-sm">Start muted</Label>
					<p class="text-xs text-muted-foreground">Begin every session muted (volume always starts at max).</p>
				</div>
				<Switch id="muteDefault" bind:checked={settings.mute_by_default} onCheckedChange={() => settings.save()} />
			</div>

			<!-- Theme -->
			<div class="flex flex-col gap-2">
				<Label class="text-xs tracking-wide text-muted-foreground uppercase">Theme</Label>
				<Select.Root type="single" value={settings.theme} onValueChange={(v) => settings.setTheme(v)}>
					<Select.Trigger class="w-full">
						<span class="flex items-center gap-2">
							<span class="flex overflow-hidden rounded ring-1 ring-foreground/15">
								{#each currentTheme.swatch as c (c)}
									<span class="size-3" style="background:{c}"></span>
								{/each}
							</span>
							{currentTheme.label}
						</span>
					</Select.Trigger>
					<Select.Content>
						{#each THEMES as t (t.id)}
							<Select.Item value={t.id} label={t.label}>
								<span class="flex w-full items-center justify-between gap-4">
									<span>{t.label}</span>
									<span class="flex overflow-hidden rounded ring-1 ring-foreground/15">
										{#each t.swatch as c (c)}
											<span class="size-3.5" style="background:{c}"></span>
										{/each}
									</span>
								</span>
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<!-- Notifications -->
			<div class="flex items-center justify-between">
				<Label for="notify" class="text-sm">Notify when downloads finish</Label>
				<Switch
					id="notify"
					bind:checked={settings.notify_on_complete}
					onCheckedChange={() => settings.save()}
				/>
			</div>

			{#if auth.loggedIn}
				<div class="flex items-center justify-between border-t border-foreground/10 pt-4">
					<div class="text-sm text-muted-foreground">
						Signed in{auth.user ? ` as ${auth.user}` : ''}
					</div>
					<Button variant="ghost" size="sm" onclick={() => engine.logout()}>
						<LogOut class="size-4" /> Sign out
					</Button>
				</div>
			{/if}

			<!-- About -->
			<div class="border-t border-foreground/10 pt-4">
				<div class="mx-auto flex max-w-[15rem] flex-col items-center gap-1.5 rounded-xl border border-foreground/10 bg-foreground/5 px-5 py-4 text-center">
					<span class="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">About</span>
					<span class="text-base font-semibold text-foreground">{APP_NAME}</span>
					<span class="rounded-full border border-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">
						v{APP_VERSION}
					</span>
					<span class="text-xs text-muted-foreground">by {APP_AUTHOR}</span>
					<span class="text-xs text-muted-foreground italic">“{APP_TAGLINE}”</span>
				</div>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
