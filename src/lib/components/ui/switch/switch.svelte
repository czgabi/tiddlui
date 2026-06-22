<script lang="ts">
	import { Switch as SwitchPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		checked = $bindable(false),
		size = "default",
		...restProps
	}: WithoutChildrenOrChild<SwitchPrimitive.RootProps> & {
		size?: "sm" | "default";
	} = $props();
</script>

<!--
  Visuals are driven straight from `checked` rather than bits-ui's data attrs:
  bits-ui v2 emits data-state="checked" (not data-checked), so the old
  data-checked: Tailwind variants never matched and the switch never moved.
-->
<SwitchPrimitive.Root
	bind:ref
	bind:checked
	data-slot="switch"
	data-size={size}
	class={cn(
		"focus-visible:ring-accent-cyan/60 group/switch peer relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent outline-none transition-colors duration-200 ease-in-out focus-visible:ring-2 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px]",
		checked ? "bg-accent-cyan" : "bg-foreground/30",
		className
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		data-slot="switch-thumb"
		class={cn(
			"pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3",
			checked ? "translate-x-[calc(100%-2px)]" : "translate-x-0"
		)}
	/>
</SwitchPrimitive.Root>
