<script lang="ts">
  let { children, class: className = '' } = $props();
</script>

<div class={`cards ${className}`}>
  {@render children()}
</div>
