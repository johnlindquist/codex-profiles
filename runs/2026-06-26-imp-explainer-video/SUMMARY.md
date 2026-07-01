# Imp Explainer Video

## Output

- Oracle session: `imp-explainer-video`
- Original generated video: `videos/imp-explainer-video.mp4`
- Final silent video: `videos/imp-explainer-video-silent.mp4`
- Prompt: `prompts/create-video.md`
- Contact sheet: `receipts/contact-sheet.jpg`

## Verification

- Original ffprobe: `receipts/ffprobe.imp-explainer-video.json`
  - 1280x720
  - H.264 video
  - AAC audio
  - 10.005s container duration
- Final silent ffprobe: `receipts/ffprobe.imp-explainer-video-silent.json`
  - 1280x720
  - H.264 video only
  - 10.000s duration
- Original SHA-256: `receipts/imp-explainer-video.sha256`
- Final silent SHA-256: `receipts/imp-explainer-video-silent.sha256`

## Visual Read

The contact sheet shows a cream/navy workshop scene where a request enters a router, splits into colored lanes, reaches multiple tiny isolated helpers in tool bubbles, and returns paper receipts. The clip explains imps visually as small focused agents: one tool each, isolated boundaries, router-selected, evidence returned.

No guardrail ladder was needed. The generated clip included an audio track, so the final deliverable strips audio.
