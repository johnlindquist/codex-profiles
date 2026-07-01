<script lang="ts">
  let {
    tab,
    children,
    class: className = ''
  }: {
    tab: string;
    children: import('svelte').Snippet;
    class?: string;
  } = $props();
</script>

<aside class={`info-card ${className}`} data-tab={tab}>
  {@render children()}
</aside>
