<script lang="ts">
  import '../app.css';

  let { children } = $props();
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Nunito:ital,wght@0,400..1000;1,400..1000&family=Caveat:wght@600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

{@render children()}
