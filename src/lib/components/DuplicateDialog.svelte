<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { FileWarning } from '@lucide/svelte';
	import { ui } from '$lib/stores/ui.svelte';
	import { engine } from '$lib/ipc/commands';

	const open = $derived(ui.duplicate !== null);

	function resolve(action: 'cancel' | 'replace' | 'version') {
		if (ui.duplicate) engine.resolveDuplicate(ui.duplicate.job_id, action);
		ui.duplicate = null;
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

		<div class="flex flex-col gap-2 py-2">
			<Button variant="secondary" onclick={() => resolve('replace')}>Replace it</Button>
			<Button variant="secondary" onclick={() => resolve('version')}>Keep both (add a number)</Button>
			<Button variant="ghost" onclick={() => resolve('cancel')}>Skip this download</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
