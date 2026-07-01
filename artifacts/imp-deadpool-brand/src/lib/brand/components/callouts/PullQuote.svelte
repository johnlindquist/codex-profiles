<script lang="ts">
  let { children, class: className = '' } = $props();
</script>

<p class={`pull ${className}`}>
  {@render children()}
</p>
