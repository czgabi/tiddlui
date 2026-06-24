<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { FileWarning } from '@lucide/svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { engine } from '$lib/ipc/commands';

	const open = $derived(ui.duplicate !== null);
	let applyAll = $state(false);

	function resolve(action: 'cancel' | 'replace' | 'version') {
		if (ui.duplicate) engine.resolveDuplicate(ui.duplicate.job_id, action, applyAll);
		ui.duplicate = null;
		applyAll = false;
	}
</script>

<Dialog.Root
	{open}
	onOpenChange={(v) => {
		if (!v) resolve('cancel');
	}}
>
	<Dialog.Content class="glass-strong border-foreground/10 sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<FileWarning class="size-5 text-accent-pink" /> File already exists
			</Dialog.Title>
			<Dialog.Description>
				<span class="font-mono text-foreground">{ui.duplicate?.name}</span> is already in the
				output folder. What should I do?
			</Dialog.Description>
		</Dialog.Header>

		<label class="flex cursor-pointer items-center gap-2 py-1 text-sm text-muted-foreground">
			<input
				type="checkbox"
				bind:checked={applyAll}
				class="size-4 rounded border-foreground/30 bg-foreground/5 accent-accent-cyan"
			/>
			Apply to all remaining files in this download
		</label>

		<div class="flex flex-col gap-2 py-2">
			<Button variant="secondary" onclick={() => resolve('replace')}>
				Replace{applyAll ? ' all' : ' it'}
			</Button>
			<Button variant="secondary" onclick={() => resolve('version')}>
				Keep both (add a number){applyAll ? ', all' : ''}
			</Button>
			<Button variant="ghost" onclick={() => resolve('cancel')}>
				Skip {applyAll ? 'all remaining' : 'this download'}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
