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

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const presetValue = $derived(
		TEMPLATE_PRESETS.find((p) => p.value === settings.template)?.value ?? 'custom'
	);
	const presetLabel = $derived(
		TEMPLATE_PRESETS.find((p) => p.value === presetValue)?.label ?? 'Custom'
	);

	async function browse() {
		const dir = await openDialog({ directory: true, defaultPath: settings.output_path || undefined });
		if (typeof dir === 'string') {
			settings.output_path = dir;
			settings.save();
		}
	}

	function onPreset(value: string) {
		if (value !== 'custom') {
			settings.template = value;
			settings.save();
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="glass-strong border-white/10 sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Settings</Dialog.Title>
			<Dialog.Description>Preferences are saved automatically.</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-5 py-2">
			<!-- Output folder -->
			<div class="flex flex-col gap-2">
				<Label class="text-xs tracking-wide text-muted-foreground uppercase">Output folder</Label>
				<div class="flex gap-2">
					<Input value={settings.output_path} readonly class="flex-1 font-mono text-xs" />
					<Button variant="secondary" size="sm" onclick={browse}>
						<FolderOpen class="size-4" /> Browse
					</Button>
				</div>
			</div>

			<!-- Template -->
			<div class="flex flex-col gap-2">
				<Label class="text-xs tracking-wide text-muted-foreground uppercase">Filename template</Label>
				<Select.Root type="single" value={presetValue} onValueChange={onPreset}>
					<Select.Trigger class="w-full">{presetLabel}</Select.Trigger>
					<Select.Content>
						{#each TEMPLATE_PRESETS as p (p.value)}
							<Select.Item value={p.value} label={p.label}>{p.label}</Select.Item>
						{/each}
						<Select.Item value="custom" label="Custom">Custom…</Select.Item>
					</Select.Content>
				</Select.Root>
				<Input
					bind:value={settings.template}
					oninput={() => settings.save()}
					class="font-mono text-xs"
					spellcheck={false}
				/>
				<p class="truncate text-xs text-muted-foreground/70">
					Preview: <span class="text-accent-cyan">{previewTemplate(settings.template)}</span>
				</p>
			</div>

			<!-- Theme -->
			<div class="flex flex-col gap-2">
				<Label class="text-xs tracking-wide text-muted-foreground uppercase">Theme</Label>
				<div class="grid grid-cols-3 gap-2">
					{#each THEMES as t (t.id)}
						<button
							onclick={() => settings.setTheme(t.id)}
							class="flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors {settings.theme ===
							t.id
								? 'border-accent-cyan bg-white/5'
								: 'border-white/10 hover:bg-white/5'}"
						>
							<div class="flex h-8 overflow-hidden rounded-md ring-1 ring-white/10">
								<span class="flex-1" style="background:{t.swatch[0]}"></span>
								<span class="flex-1" style="background:{t.swatch[1]}"></span>
								<span class="flex-1" style="background:{t.swatch[2]}"></span>
							</div>
							<span class="text-xs font-medium text-foreground">{t.label}</span>
						</button>
					{/each}
				</div>
			</div>

			<!-- Notifications -->
			<div class="flex items-center justify-between">
				<Label for="notify" class="text-sm">Notify when downloads finish</Label>
				<Switch
					id="notify"
					checked={settings.notify_on_complete}
					onCheckedChange={(v) => {
						settings.notify_on_complete = v;
						settings.save();
					}}
				/>
			</div>

			{#if auth.loggedIn}
				<div class="flex items-center justify-between border-t border-white/10 pt-4">
					<div class="text-sm text-muted-foreground">
						Signed in{auth.user ? ` as ${auth.user}` : ''}
					</div>
					<Button variant="ghost" size="sm" onclick={() => engine.logout()}>
						<LogOut class="size-4" /> Sign out
					</Button>
				</div>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
