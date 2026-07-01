<script lang="ts">
  let {
    label,
    title,
    children
  }: {
    label: string;
    title: string;
    children: import('svelte').Snippet;
  } = $props();
</script>

<article class="mini-card">
  <span class="label">{label}</span>
  <b>{title}</b>
  <small>{@render children()}</small>
</article>
