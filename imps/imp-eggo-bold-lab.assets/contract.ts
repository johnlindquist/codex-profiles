import { existsSync } from "node:fs";

export type EggoBoldLabAssetKind = "reference-sheet" | "section-scene";
export const EGGO_BOLD_LAB_EMOTIONS = [
  "joyful",
  "celebrating",
  "delighted",
  "excited",
  "proud",
  "satisfied",
  "hopeful",
  "relieved",
  "calm",
  "focused",
  "determined",
  "curious",
  "surprised",
  "amazed",
  "alarmed",
  "confused",
  "uncertain",
  "skeptical",
  "cautious",
  "concerned",
  "anxious",
  "overwhelmed",
  "frustrated",
  "annoyed",
  "disappointed",
  "embarrassed",
  "exhausted",
] as const;
export type EggoBoldLabEmotion = (typeof EGGO_BOLD_LAB_EMOTIONS)[number];
export type EggoBoldLabControlLink = "wireless-signal" | "joystick" | "remote-console";

export type EggoBoldLabRequest = {
  assetKind: EggoBoldLabAssetKind;
  sectionTitle: string;
  sectionClaim: string;
  audienceContext: string;
  sceneAction: string;
  mainEggoEmotion: EggoBoldLabEmotion;
  robotProxyCount: number;
  robotControlLink: EggoBoldLabControlLink;
  mustInclude: string[];
  visibleConsequence: string;
  mustAvoid: string[];
  assetSlug: string;
  backgroundKey: string;
  outputDir: string;
  referenceEggo: string[];
  referenceStyle: string[];
  dryRun: boolean;
  run: boolean;
};

type FlagSpec = {
  name: string;
  property: keyof EggoBoldLabRequest;
  placeholder: string;
  description: string;
  kind: "string" | "csv" | "path-list" | "number" | "enum";
  required?: boolean;
  defaultValue?: string | string[] | number | boolean;
  enumValues?: string[];
};

export type EggoBoldLabParseResult =
  | { ok: true; request: EggoBoldLabRequest }
  | {
      ok: false;
      missing: string[];
      invalid: Array<{ flag: string; value?: string; reason: string }>;
      unknown: string[];
      positionals: string[];
      messages: string[];
      values: Partial<EggoBoldLabRequest>;
    };

const stableSlug = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const allowedBackgroundKey = "#00ff00";

export const EGGO_BOLD_LAB_FLAG_SPECS: FlagSpec[] = [
  { name: "--asset-kind", property: "assetKind", placeholder: "<reference-sheet|section-scene>", description: "Generated asset type.", kind: "enum", enumValues: ["reference-sheet", "section-scene"], required: true },
  { name: "--section-title", property: "sectionTitle", placeholder: "<text>", description: "Exact section or reference-sheet title.", kind: "string", required: true },
  { name: "--section-claim", property: "sectionClaim", placeholder: "<text>", description: "One-sentence claim the image must communicate.", kind: "string", required: true },
  { name: "--audience-context", property: "audienceContext", placeholder: "<text>", description: "Reader context for the image.", kind: "string", required: true },
  { name: "--scene-action", property: "sceneAction", placeholder: "<text>", description: "The simple visible action Eggo and the robot proxies perform.", kind: "string", required: true },
  { name: "--main-eggo-emotion", property: "mainEggoEmotion", placeholder: `<${EGGO_BOLD_LAB_EMOTIONS.join("|")}>`, description: "Required emotionally specific Eggo reaction.", kind: "enum", enumValues: [...EGGO_BOLD_LAB_EMOTIONS], required: true },
  { name: "--robot-proxy-count", property: "robotProxyCount", placeholder: "<2-5>", description: "Number of mini-eggo robot proxies.", kind: "number", defaultValue: 3 },
  { name: "--robot-control-link", property: "robotControlLink", placeholder: "<wireless-signal|joystick|remote-console>", description: "Control relationship from main Eggo to robot proxies.", kind: "enum", enumValues: ["wireless-signal", "joystick", "remote-console"], required: true },
  { name: "--must-include", property: "mustInclude", placeholder: "<csv:min=3>", description: "Simple metaphor props or actors that must appear.", kind: "csv", required: true },
  { name: "--visible-consequence", property: "visibleConsequence", placeholder: "<text>", description: "Visible result of the action.", kind: "string", required: true },
  { name: "--must-avoid", property: "mustAvoid", placeholder: "<csv|none>", description: "Forbidden visual shortcuts or defects.", kind: "csv", defaultValue: [] },
  { name: "--asset-slug", property: "assetSlug", placeholder: "<slug>", description: "Stable output slug.", kind: "string", required: true },
  { name: "--background-key", property: "backgroundKey", placeholder: "<#00ff00>", description: "Required green-screen key color.", kind: "string", defaultValue: allowedBackgroundKey },
  { name: "--output-dir", property: "outputDir", placeholder: "<path>", description: "Directory for source and transparent PNG outputs.", kind: "string", defaultValue: ".notes/eggo-bold-lab" },
  { name: "--reference-eggo", property: "referenceEggo", placeholder: "<path[,path]>", description: "Optional canonical Eggo identity references.", kind: "path-list", defaultValue: [] },
  { name: "--reference-style", property: "referenceStyle", placeholder: "<path[,path]>", description: "Optional bold-lab style references.", kind: "path-list", defaultValue: [] },
];

const defaults: EggoBoldLabRequest = {
  assetKind: "section-scene",
  sectionTitle: "",
  sectionClaim: "",
  audienceContext: "",
  sceneAction: "",
  mainEggoEmotion: "celebrating",
  robotProxyCount: 3,
  robotControlLink: "wireless-signal",
  mustInclude: [],
  visibleConsequence: "",
  mustAvoid: [],
  assetSlug: "",
  backgroundKey: allowedBackgroundKey,
  outputDir: ".notes/eggo-bold-lab",
  referenceEggo: [],
  referenceStyle: [],
  dryRun: false,
  run: false,
};

export function parseEggoBoldLabCli(argv: string[]): EggoBoldLabParseResult {
  const values: Partial<EggoBoldLabRequest> = { ...defaults };
  const missing: string[] = [];
  const invalid: Array<{ flag: string; value?: string; reason: string }> = [];
  const unknown: string[] = [];
  const positionals: string[] = [];
  const messages: string[] = [];
  const byName = new Map(EGGO_BOLD_LAB_FLAG_SPECS.map((spec) => [spec.name, spec]));

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--dry-run") {
      values.dryRun = true;
      continue;
    }
    if (arg === "--run") {
      values.run = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const spec = byName.get(arg);
    if (!spec) {
      unknown.push(arg);
      continue;
    }
    const raw = argv[index + 1];
    if (!raw || raw.startsWith("--")) {
      invalid.push({ flag: arg, reason: "requires a value" });
      continue;
    }
    index += 1;
    if (spec.kind === "csv" || spec.kind === "path-list") {
      (values as Record<string, unknown>)[spec.property] = parseCsv(raw);
    } else if (spec.kind === "number") {
      (values as Record<string, unknown>)[spec.property] = Number(raw);
    } else {
      (values as Record<string, unknown>)[spec.property] = raw;
    }
  }

  for (const spec of EGGO_BOLD_LAB_FLAG_SPECS) {
    const value = values[spec.property];
    if (spec.required && (value === "" || (Array.isArray(value) && value.length === 0))) missing.push(spec.name);
  }
  if (positionals.length) messages.push("Unexpected positional prompt. Use the required bold-lab flags instead.");
  if (unknown.length) messages.push(`Unknown flags: ${unknown.join(", ")}`);

  const request = values as EggoBoldLabRequest;
  validateRequest(request, invalid, messages);

  if (missing.length || invalid.length || unknown.length || positionals.length || messages.length) {
    return { ok: false, missing, invalid, unknown, positionals, messages, values };
  }
  return { ok: true, request };
}

function validateRequest(
  request: EggoBoldLabRequest,
  invalid: Array<{ flag: string; value?: string; reason: string }>,
  messages: string[],
) {
  if (!["reference-sheet", "section-scene"].includes(request.assetKind)) invalid.push({ flag: "--asset-kind", value: request.assetKind, reason: "must be reference-sheet or section-scene" });
  if (!(EGGO_BOLD_LAB_EMOTIONS as readonly string[]).includes(request.mainEggoEmotion)) invalid.push({ flag: "--main-eggo-emotion", value: request.mainEggoEmotion, reason: `must be one of: ${EGGO_BOLD_LAB_EMOTIONS.join(", ")}` });
  if (!["wireless-signal", "joystick", "remote-console"].includes(request.robotControlLink)) invalid.push({ flag: "--robot-control-link", value: request.robotControlLink, reason: "must be a supported control mode" });
  if (!Number.isInteger(request.robotProxyCount) || request.robotProxyCount < 2 || request.robotProxyCount > 5) invalid.push({ flag: "--robot-proxy-count", value: String(request.robotProxyCount), reason: "must be an integer from 2 to 5" });
  if (request.mustInclude.length < 3) invalid.push({ flag: "--must-include", value: request.mustInclude.join(","), reason: "must list at least three simple visible props or actors" });
  const includeText = request.mustInclude.join(" ").toLowerCase();
  if (request.mustInclude.length && !/mini[- ]eggo.*robot|robot.*prox/.test(includeText)) invalid.push({ flag: "--must-include", value: request.mustInclude.join(","), reason: "must include mini-eggo robot proxies or equivalent robot primitive" });
  if (request.assetSlug && !stableSlug.test(request.assetSlug)) invalid.push({ flag: "--asset-slug", value: request.assetSlug, reason: "must be a stable lowercase slug with hyphens" });
  if (request.backgroundKey.toLowerCase() !== allowedBackgroundKey) invalid.push({ flag: "--background-key", value: request.backgroundKey, reason: "must be #00ff00 for the bundled chroma-key workflow" });

  const hardBans = ["isometric", "2.5d", "opaque background", "technical illustration", "dense ui", "muted editorial"];
  const requestedBadStyle = hardBans.find((item) => request.sceneAction.toLowerCase().includes(item));
  if (requestedBadStyle) messages.push(`Rejected scene-action style anchor: ${requestedBadStyle}. Put defects in --must-avoid, not in the requested action.`);
  if (request.sceneAction.toLowerCase().includes("photorealistic")) messages.push("Photorealistic styling is not allowed for this bold-lab imp.");

  for (const [flag, paths] of [
    ["--reference-eggo", request.referenceEggo],
    ["--reference-style", request.referenceStyle],
  ] as const) {
    for (const path of paths) if (!existsSync(path)) invalid.push({ flag, value: path, reason: "reference path not found" });
  }
}

function parseCsv(value: string): string[] {
  if (value.trim().toLowerCase() === "none") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function formatEggoBoldLabFlagContract(name: string): string {
  return `Required bold-lab flag contract:
${EGGO_BOLD_LAB_FLAG_SPECS.map((spec) => `  ${spec.name} ${spec.placeholder}  ${spec.description}`).join("\n")}

Optional controls:
  --dry-run  Print prompt and audit receipt without generating.
  --run      Generate one green-screen source and transparent PNG.

Copyable section-scene template:
${name} \\
  --asset-kind "section-scene" \\
  --section-title "Make The Repo Agent-Ready" \\
  --section-claim "Agents work better when a repo exposes clear entrypoints, fast checks, and safe task boundaries." \\
  --audience-context "developers preparing a software project for Codex and imp workflows" \\
  --scene-action "main Eggo joyfully pilots mini-eggo robot proxies through a simple lab-machine repo workflow" \\
  --main-eggo-emotion "celebrating" \\
  --robot-proxy-count "3" \\
  --robot-control-link "wireless-signal" \\
  --must-include "repo entrypoint machine,verification gate,safe task lane,mini-eggo robot proxies,main Eggo controller" \\
  --visible-consequence "confusing repo clutter becomes a bright safe route that the robot proxies can follow" \\
  --must-avoid "isometric,2.5D,thin technical illustration,opaque background,dense UI,muted editorial sketch,label-only meaning" \\
  --asset-slug "make-repo-agent-ready-bold-lab" \\
  --dry-run`;
}

export function formatEggoBoldLabFlagFailure(result: Exclude<EggoBoldLabParseResult, { ok: true }>, name: string): string {
  return `${name}: missing or invalid bold-lab flags

No image generation was attempted.

${result.missing.length ? `Missing flags:\n${result.missing.map((flag) => `- ${flag}`).join("\n")}\n` : ""}${result.invalid.length ? `Invalid flags:\n${result.invalid.map((item) => `- ${item.flag}${item.value ? `=${item.value}` : ""}: ${item.reason}`).join("\n")}\n` : ""}${result.positionals.length ? `Unexpected positional prompts:\n${result.positionals.map((item) => `- ${item}`).join("\n")}\n` : ""}${result.messages.length ? `Validation messages:\n${result.messages.map((item) => `- ${item}`).join("\n")}\n` : ""}
${formatEggoBoldLabFlagContract(name)}`;
}

export function buildEggoBoldLabPrompt(request: EggoBoldLabRequest, inputImages: string[]): string {
  const specimenBlock = request.assetKind === "reference-sheet"
    ? `Reference sheet specimens:
- joyful main Eggo with controller
- mini-eggo robot proxy front view
- mini-eggo robot proxy side view
- wireless command signal from main Eggo
- repo mechanism as one simple chunky lab machine
- verification gate as one bold gauge/latch machine
- launch dock as one simple cartoon portal`
    : `Visual causality:
- simple prop: ${request.mustInclude[0] ?? "workflow prop"}
- robot action: mini-eggo robot proxies act through chunky mech arms/tool arms
- visible consequence: ${request.visibleConsequence}`;

  return `Use case: illustration-story
Asset type: ${request.assetKind === "reference-sheet" ? "transparent reusable Eggo bold-lab vocabulary sheet" : "transparent workshop section Eggo scene"}
Generation mode: transparent green-screen source, then chroma-keyed transparent PNG.
Reference image role map:
${inputImages.length ? inputImages.map((path, index) => `Image ${index + 1}: reference only. Path: ${path}`).join("\n") : "No reference images attached."}

Section title: "${request.sectionTitle}"
Section claim: "${request.sectionClaim}"
Audience: ${request.audienceContext}
Scene action: ${request.sceneAction}
Visible consequence: ${request.visibleConsequence}

Output contract:
- Generate a source image on a perfectly flat solid ${request.backgroundKey} green-screen background.
- Then run the bundled chroma-key workflow to produce a transparent PNG with alpha.
- Opaque-background output is invalid.
- The final transparent PNG is the deliverable; the green-screen source is retained for audit.

Style inference contract:
Image 1 is the visual style authority. Infer the drawing style, line quality, shape language, color behavior, composition energy, and level of simplicity from Image 1.
If additional reference images are attached, use them as pose, hand, eyebrow, and expression-mark vocabulary references. They are not style overrides.
Do not name or blend in any other style source. Do not make the image look like a polished render, product mockup, dashboard illustration, technical diagram, 3D toy render, isometric asset, soft-material render, or clay/plastic object.
Keep forms flat and cartoon-readable: bold 2D sticker cluster, simple fills, controlled highlights, limited shadow shapes, and no rendered material texture on Eggo or props.
Use the requested pose, position, and camera angle when provided: low angle, slight overhead, over-shoulder, side-view, close-up, or three-quarter cartoon staging are all allowed.
Keep the staging as a bold sticker-like cluster rather than an isometric scene, 2.5D render, dashboard illustration, or sprawling environment.
Keep the entire subject inside the center 70% of the canvas, leaving at least 15% empty green-screen border on all four sides.
Do not use green, teal, sage, mint, lime, olive, or key-adjacent subject colors anywhere on the subject, props, status strips, highlights, shadows, expression marks, signal pings, buttons, or robot accessories. Use yellow, blue, red, orange, pink, purple, black, white, and gray for all foreground marks and accessories instead.

Main Eggo role and emotion:
Main Eggo represents the human/controller following along. Main Eggo is ${request.mainEggoEmotion}, emotionally specific, and in control.
Do not default to a raised fist. Choose a distinct hand/eyebrow/expression silhouette from the requested scene action: pointing finger, open palm, both hands on glasses, cheek-hold, thinking hand, two thumbs, shrugging palms, hand-over-glasses, notebook/pen hand, map-holding hand, controller grip, baton/wand point, or both hands on a prop.
Eyebrows must vary with the emotion: high rounded joy brows, one skeptical arched brow, worried inward brows, focused angled brows, proud relaxed brows, surprised raised brows, delighted crescent brows, alarmed high-stress brows, exhausted drooping brows, or embarrassed tucked brows. Do not reuse the same eyebrow pair for every slide.
Expression decorations must vary with the emotion and action: sparkles, question marks, sweat drops, tiny scribble cloud, speed lines, swirl marks, puffs, small starbursts, lightbulb, dotted orbit, wobble marks, breath puffs, or simple radiating lines. Do not use the same orange exclamation burst on every image.
Use at most one closed fist across an entire batch of slide images; avoid closed fists unless the scene action explicitly asks for one.
Main Eggo always keeps complete black glasses visible; the glasses may tilt, slide, reflect, or be touched by hands to show emotion, but they must not disappear.
Main Eggo has no eyes, no pupils, no mouth, no nose, no legs, no feet, no shoes, no footwear, no arms, no forearms, no elbows, no wrists, no sleeves, no crossed-arm bands, and no limb connector lines. Hands are floating white mittens near the shell or overlapping a prop.
Main Eggo shell surface must stay clean and simple: smooth flat off-white cartoon fill with only one or two broad soft shadow shapes. The shell interior should look like clean vector/cartoon color, not a sketched material surface. Do not add egg-shell texture, paper grain, pencil hatching, scratchy oval strokes, contour hatch lines, speckles, realistic shell texture, or visible fiber/grain on the egg body.
Hand plausibility: Eggo has no visible arms, but every floating hand must imply a short invisible arm from Eggo's left or right shell side. For a front-facing Eggo, Eggo-left appears on viewer-right and Eggo-right appears on viewer-left. If two hands are visible, they must form a complementary left/right pair, not two left hands, two right hands, or duplicated same-hand poses. Thumb/finger direction, palm angle, wrist turn, scale, and reach must match the assigned side. Hands may overlap the shell or props, but must stay within the short, reference-like reach shown in the provided Eggo references.
For slide use, aim the action up and left: Main Eggo and the scene energy should point toward upper-left title/text space when placed at the bottom-right of a 16:9 slide.

Mini-eggo robot proxy contract:
Show exactly ${request.robotProxyCount} mini-eggo robot proxies controlled by main Eggo.
Each mini-eggo robot is about one-quarter the height of Main Eggo, and never more than one-third of Main Eggo height.
Place mini-eggo robots lower or farther from Main Eggo if needed so their scale reads clearly small.
They must read as smaller Eggos first, with small robot accessories second: a mostly visible white egg body, black robot goggles or visor, tiny wheeled/treaded base, one or two small mech arms, and an antenna or sensor light.
They are controlled wirelessly by main Eggo: use small floating signal pings, controller glow, or expression/pose staging, with no cords, cables, tethers, hoses, leashes, or physical links.
Mini-eggo robots may have tiny claw/tool arms, but their white egg body must stay unobscured. They must not have human arms, soft mitten hands, fingers, legs, feet, shoes, footwear, boots, sneakers, sandals, mouths, pupils, or independent-agent staging.

Simple metaphor prop contract:
Use one simple software-workflow metaphor per image. Big simple props only: checklist, test gauge, terminal tile, package box, puzzle block, button, cartridge, launch dock, or status light.
Cap the scene at one main Eggo, ${request.robotProxyCount} robot proxies, two to four major props, and zero to two tiny labels. No paragraph UI, no dense file stacks, no multi-room environment, no sprawling factory perspective, no route arrows, no floor lanes, no full-bleed paths.

Required visible items:
${request.mustInclude.map((item) => `- ${item}`).join("\n")}

${specimenBlock}

Green-screen contract:
The entire outer background is exactly uniform ${request.backgroundKey}: no shadows, gradients, airbrush, texture, reflections, floor plane, wall, room, card frame, labels, props, energy marks, or lighting variation.
Leave a continuous empty flat ${request.backgroundKey} moat around all subject matter. Nothing touches the canvas edge. No black outline, prop, sparkle, arrow, path, robot, or Eggo body part may enter the outer 15% border.
Only the removable outer background may be green. Foreground green marks are invalid because they either survive as visual contamination or risk being removed during chroma keying.

Must avoid:
${request.mustAvoid.length ? request.mustAvoid.map((item) => `- ${item}`).join("\n") : "- none beyond the hard style bans"}
- polished render, 3D toy render, isometric asset, soft-material render, clay/plastic object, rendered material shading, or dashboard/product mockup look
- two left hands, two right hands, duplicated mitten silhouettes, impossible palm-side duplicates, broken wrist flips, overextended floating hands, or hands that cannot be mentally connected to the nearest plausible shell side by a short invisible arm
- visible arms, forearms, elbows, wrists, sleeves, crossed-arm bands, white arm tubes, limb connector lines, or arm-like shapes connecting hands to the shell
- shoes, footwear, boots, sneakers, sandals, soles, laces, feet, toes, or any shoe-like base attached to Main Eggo or any mini-eggo robot
- egg-shell texture, paper grain, pencil hatching, contour hatch lines, scratchy shell strokes, speckles, realistic shell texture, or visible fiber/grain on Main Eggo's egg body

Final quality gate:
The image fails if it is not a green-key source suitable for a transparent PNG; if it becomes a 3D/isometric/material-rendered object instead of a 2D sticker-like scene; if Eggo is emotionally flat; if Main Eggo falls back to the generic raised-fist plus orange-exclamation-burst pose when a different hand/expression is requested; if visible hands do not form a plausible left/right pair with correct thumb/finger/palm orientation and short invisible-arm reach; if any visible arm, forearm, elbow, wrist, sleeve, crossed-arm band, white arm tube, or limb connector line appears on Main Eggo; if shoes, footwear, boots, sneakers, sandals, soles, laces, toes, or feet appear on Main Eggo or any mini-eggo robot; if Main Eggo's egg body has egg-shell texture, paper grain, pencil hatching, contour hatch lines, scratchy shell strokes, speckles, realistic shell texture, or visible fiber/grain; if foreground green/key-adjacent marks appear on subject matter; if eyebrows do not match the requested emotion; if mini-eggo agents are not about one-quarter Main Eggo height; if mini-eggo agents are not mostly visible white egg bodies; if they lack goggles/visor, wheels/treads, or tiny mech arms/tool arms; if any cord, cable, tether, hose, leash, or physical control link appears; if robots have human hands/fingers/legs/feet; if the metaphor is label-only; or if the image cannot be understood at thumbnail size. Treat mild style polish and close-but-not-exact green background as audit warnings, not pre-chroma hard failures, when the anatomy, footwear, texture, foreground-color, and final chroma geometry gates pass.`;
}

export function formatEggoBoldLabDryRunReceipt(request: EggoBoldLabRequest, prompt: string, inputImages: string[]): string {
  return `Eggo bold-lab dry run
asset_kind: ${request.assetKind}
main_eggo_emotion: ${request.mainEggoEmotion}
robot_proxy_count: ${request.robotProxyCount}
robot_control_link: ${request.robotControlLink}
background_key: ${request.backgroundKey}
output_dir: ${request.outputDir}
asset_slug: ${request.assetSlug}

Reference role map:
${inputImages.length ? inputImages.map((path, index) => `- Image ${index + 1}: ${path}`).join("\n") : "- none"}

Expanded prompt:
${prompt}`;
}
