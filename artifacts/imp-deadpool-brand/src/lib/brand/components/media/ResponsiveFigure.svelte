<script lang="ts">
  let {
    src,
    alt,
    caption,
    width = 'breakout',
    class: className = ''
  }: {
    src: string;
    alt: string;
    caption?: string;
    width?: 'content' | 'breakout' | 'full';
    class?: string;
  } = $props();
</script>

<figure class={`${width === 'content' ? '' : width} ${className}`}>
  <img {src} {alt} />
  {#if caption}
    <figcaption>{caption}</figcaption>
  {/if}
</figure>
