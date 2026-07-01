<script lang="ts">
  let {
    title = 'terminal',
    text,
    language = 'txt',
    wrap = false,
    ariaLabel,
    class: className = ''
  }: {
    title?: string;
    text: string;
    language?: string;
    wrap?: boolean;
    ariaLabel?: string;
    class?: string;
  } = $props();
</script>

<div class={`code-card ${className}`} data-language={language} aria-label={ariaLabel ?? title}>
  <div class="bar">
    <i style="background:#E06C5E"></i>
    <i style="background:#F7C948"></i>
    <i style="background:#9DBE8D"></i>
    <span class="fn">{title}</span>
  </div>
  <pre style:white-space={wrap ? 'pre-wrap' : 'pre'}>{text}</pre>
</div>
