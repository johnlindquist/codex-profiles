<script lang="ts">
  let {
    eyebrow,
    title,
    lede,
    byline
  }: {
    eyebrow: string;
    title: string;
    lede: string;
    byline: string;
  } = $props();
</script>

<span class="eyebrow">{eyebrow}</span>
<h1>{title}</h1>
<p class="lede">{lede}</p>
<div class="byline">
  <span>{byline}</span>
</div>
<div class="rule"></div>
