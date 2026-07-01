import { existsSync } from "node:fs";

export type EggoResetDesignId = "editorial-metaphor" | "workflow-diagram" | "agent-robots" | "reference-sheet";
export type EggoResetQuality = "low" | "medium" | "high" | "auto";
export type EggoResetBackground = "opaque" | "auto";

export type EggoResetDesign = {
  id: EggoResetDesignId;
  impName: string;
  displayName: string;
  styleLanguage: string[];
  metaphorGrammar: string[];
  promptFrame: string;
};

export type EggoResetRequest = {
  sectionTitle: string;
  sectionClaim: string;
  audienceContext: string;
  metaphorFocus: string;
  mustInclude: string[];
  mustAvoid: string[];
  visibleConsequence: string;
  outputIntent: string;
  assetSlug: string;
  size: string;
  quality: EggoResetQuality;
  background: EggoResetBackground;
  outputDir: string;
  referenceEggo: string[];
  referenceStyle: string[];
  referenceRobots: string[];
  referenceProps: string[];
  dryRun: boolean;
  run: boolean;
};

type FlagSpec = {
  name: string;
  property: keyof EggoResetRequest;
  placeholder: string;
  description: string;
  kind: "string" | "csv" | "path-list" | "enum";
  required?: boolean;
  defaultValue?: string | string[] | boolean;
  enumValues?: string[];
};

export type EggoResetParseResult =
  | { ok: true; request: EggoResetRequest }
  | {
      ok: false;
      missing: string[];
      invalid: Array<{ flag: string; value?: string; reason: string }>;
      unknown: string[];
      positionals: string[];
      messages: string[];
      values: Partial<EggoResetRequest>;
    };

const stableSlug = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const sizePattern = /^(\d+)x(\d+)$/;
const oldStyleAnchors = [
  "pop western",
  "pop-western",
  "candy-colored",
  "game-show",
  "starburst as meaning",
  "signs reading tools",
  "signs that say tools",
  "badges as default",
  "crates as default",
  "rails as default",
];

export const EGGO_RESET_FLAG_SPECS: FlagSpec[] = [
  { name: "--section-title", property: "sectionTitle", placeholder: "<text>", description: "Exact workshop section title.", kind: "string", required: true },
  { name: "--section-claim", property: "sectionClaim", placeholder: "<text>", description: "One-sentence claim the image must communicate.", kind: "string", required: true },
  { name: "--audience-context", property: "audienceContext", placeholder: "<text>", description: "Reader context for the image.", kind: "string", required: true },
  { name: "--metaphor-focus", property: "metaphorFocus", placeholder: "<text>", description: "The concrete transformation the visual metaphor must show.", kind: "string", required: true },
  { name: "--must-include", property: "mustInclude", placeholder: "<csv:min=3>", description: "Concrete workflow primitives that must appear.", kind: "csv", required: true },
  { name: "--must-avoid", property: "mustAvoid", placeholder: "<csv|none>", description: "Forbidden visual shortcuts or defects.", kind: "csv", defaultValue: [] },
  { name: "--visible-consequence", property: "visibleConsequence", placeholder: "<text>", description: "Visible before/after or local result.", kind: "string", required: true },
  { name: "--output-intent", property: "outputIntent", placeholder: "<text>", description: "Where this generated comparison image will be used.", kind: "string", required: true },
  { name: "--asset-slug", property: "assetSlug", placeholder: "<slug>", description: "Stable output slug.", kind: "string", required: true },
  { name: "--size", property: "size", placeholder: "<WIDTHxHEIGHT>", description: "gpt-image-2-compatible size.", kind: "string", defaultValue: "1536x1024" },
  { name: "--quality", property: "quality", placeholder: "<low|medium|high|auto>", description: "Image quality intent.", kind: "enum", enumValues: ["low", "medium", "high", "auto"], defaultValue: "medium" },
  { name: "--background", property: "background", placeholder: "<opaque|auto>", description: "Reset imps intentionally do not support transparent output.", kind: "enum", enumValues: ["opaque", "auto"], defaultValue: "opaque" },
  { name: "--output-dir", property: "outputDir", placeholder: "<path>", description: "Directory where the final comparison PNG should be copied.", kind: "string", defaultValue: ".notes/eggo-reset-comparison" },
  { name: "--reference-eggo", property: "referenceEggo", placeholder: "<path[,path]>", description: "Optional canonical Eggo identity references.", kind: "path-list", defaultValue: [] },
  { name: "--reference-style", property: "referenceStyle", placeholder: "<path[,path]>", description: "Optional style-only references.", kind: "path-list", defaultValue: [] },
  { name: "--reference-robots", property: "referenceRobots", placeholder: "<path[,path]>", description: "Optional mini-eggo robot references.", kind: "path-list", defaultValue: [] },
  { name: "--reference-props", property: "referenceProps", placeholder: "<path[,path]>", description: "Optional prop grammar references.", kind: "path-list", defaultValue: [] },
];

export const eggoEditorialMetaphorDesign: EggoResetDesign = {
  id: "editorial-metaphor",
  impName: "imp-eggo-editorial-metaphor",
  displayName: "Eggo Editorial Metaphor",
  styleLanguage: [
    "hand-drawn technical editorial illustration",
    "off-white paper, ink linework, marker wash, visible human sketch texture",
    "limited color with practical accents",
    "one central metaphor, not a mascot poster",
  ],
  metaphorGrammar: [
    "abstract software concepts become physical mechanisms",
    "repo as workshop door, mechanical cabinet, blueprint wall, or repair bay",
    "tools as adapters, probes, clamps, meters, sockets, and harnesses",
    "tests as gauges, jigs, or trial gates",
    "readiness as a confusing path becoming safe, marked, and usable",
  ],
  promptFrame: "Build one editorial metaphor with cause and effect. Make the visual read like a sharp magazine illustration for developers, not a cartoon UI.",
};

export const eggoWorkflowDiagramDesign: EggoResetDesign = {
  id: "workflow-diagram",
  impName: "imp-eggo-workflow-diagram",
  displayName: "Eggo Workflow Diagram",
  styleLanguage: [
    "clean instructional poster",
    "flat diagram, crisp lines, restrained palette, readable arrows",
    "white or off-white background",
    "technical workshop slide clarity",
    "maximum five tiny labels, each one or two words, attached to functioning objects",
  ],
  metaphorGrammar: [
    "repo primitives become diagram nodes",
    "connections are visible cables, sockets, ports, arrows, and guarded lanes",
    "tool means socketed tool module plugged into a workflow, not a word",
    "labels may clarify nodes but never replace objects",
  ],
  promptFrame: "Build a diagrammatic explainer where every object maps to one software workflow primitive. Favor schematic clarity over charm.",
};

export const eggoAgentRobotsDesign: EggoResetDesign = {
  id: "agent-robots",
  impName: "imp-eggo-agent-robots",
  displayName: "Eggo Agent Robots",
  styleLanguage: [
    "hand-drawn character-led technical workshop scene",
    "clean silhouettes, tactile mechanical details, warm practical lighting",
    "neutral background with no dashboard clutter",
    "agents read as robots before they read as mascot eggs",
    "not photorealistic, not 3D-rendered, not cinematic product photography",
  ],
  metaphorGrammar: [
    "repo as miniature maintenance bay",
    "each robot has one job and one visible tool",
    "robot affordances are dominant: treads or wheels, antenna, sensor, chassis, tool module",
    "workflow should be inferable without reading labels",
  ],
  promptFrame: "Build a character-led scene where Eggo coordinates a robot crew doing concrete repo-readiness work.",
};

export const eggoReferenceSheetDesign: EggoResetDesign = {
  id: "reference-sheet",
  impName: "imp-eggo-reference-sheet",
  displayName: "Eggo Metaphor Reference Sheet",
  styleLanguage: [
    "clean hand-drawn technical reference sheet",
    "off-white paper, ink linework, restrained marker wash, visible sketch texture",
    "orthographic object studies and small action vignettes",
    "consistent silhouettes, reusable props, and enough whitespace to inspect each item",
    "not photorealistic, not 3D-rendered, not a poster scene",
  ],
  metaphorGrammar: [
    "agentic environment as a prepared maintenance bay with safe lanes, docks, gates, and work cells",
    "scripts as socketed command cartridges, adapters, tool heads, and plug-in modules",
    "context as folder bundles, maps, manifests, manuals, and cable-bound packets entering the repo mechanism",
    "verification as gauges, latches, jigs, test gates, meters, and harnesses with visible pass-through behavior",
    "handoff as a dock, port, conveyor transfer, or guarded threshold where a mini-eggo robot receives a task",
    "mini-eggo robot agents as compact wheeled or treaded bodies with antenna/sensors and chassis-mounted tools",
  ],
  promptFrame: "Build a reusable visual vocabulary sheet, not a single narrative scene. Show labeled design specimens only when the object already communicates the concept physically.",
};

export const eggoResetDesigns = [
  eggoEditorialMetaphorDesign,
  eggoWorkflowDiagramDesign,
  eggoAgentRobotsDesign,
  eggoReferenceSheetDesign,
] as const;

const defaults: EggoResetRequest = {
  sectionTitle: "",
  sectionClaim: "",
  audienceContext: "",
  metaphorFocus: "",
  mustInclude: [],
  mustAvoid: [],
  visibleConsequence: "",
  outputIntent: "",
  assetSlug: "",
  size: "1536x1024",
  quality: "medium",
  background: "opaque",
  outputDir: ".notes/eggo-reset-comparison",
  referenceEggo: [],
  referenceStyle: [],
  referenceRobots: [],
  referenceProps: [],
  dryRun: false,
  run: false,
};

export function parseEggoResetCli(argv: string[]): EggoResetParseResult {
  const values: Partial<EggoResetRequest> = { ...defaults };
  const missing: string[] = [];
  const invalid: Array<{ flag: string; value?: string; reason: string }> = [];
  const unknown: string[] = [];
  const positionals: string[] = [];
  const messages: string[] = [];
  const byName = new Map(EGGO_RESET_FLAG_SPECS.map((spec) => [spec.name, spec]));

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
    } else {
      (values as Record<string, unknown>)[spec.property] = raw;
    }
  }

  for (const spec of EGGO_RESET_FLAG_SPECS) {
    const value = values[spec.property];
    if (spec.required && (value === "" || (Array.isArray(value) && value.length === 0))) {
      missing.push(spec.name);
    }
  }

  if (positionals.length) messages.push("Unexpected positional prompt. Use the required reset flags instead.");
  if (unknown.length) messages.push(`Unknown flags: ${unknown.join(", ")}`);

  const request = values as EggoResetRequest;
  validateRequest(request, invalid, messages);

  if (missing.length || invalid.length || unknown.length || positionals.length || messages.length) {
    return { ok: false, missing, invalid, unknown, positionals, messages, values };
  }
  return { ok: true, request };
}

function validateRequest(
  request: EggoResetRequest,
  invalid: Array<{ flag: string; value?: string; reason: string }>,
  messages: string[],
) {
  if (request.assetSlug && !stableSlug.test(request.assetSlug)) {
    invalid.push({ flag: "--asset-slug", value: request.assetSlug, reason: "must be a stable lowercase slug with hyphens" });
  }
  if (!["low", "medium", "high", "auto"].includes(request.quality)) {
    invalid.push({ flag: "--quality", value: request.quality, reason: "must be low, medium, high, or auto" });
  }
  if (!["opaque", "auto"].includes(request.background)) {
    invalid.push({ flag: "--background", value: request.background, reason: "reset imps do not support transparent output; use opaque or auto" });
  }
  validateSize(request.size, invalid);
  if (request.mustInclude.length < 3) {
    invalid.push({ flag: "--must-include", value: request.mustInclude.join(","), reason: "must list at least three concrete workflow primitives" });
  }
  const includeText = request.mustInclude.join(" ").toLowerCase();
  if (request.mustInclude.length && !/mini[- ]eggo.*robot|robot.*mini[- ]eggo/.test(includeText)) {
    invalid.push({ flag: "--must-include", value: request.mustInclude.join(","), reason: "must include mini-eggo robot agents or equivalent robot-agent primitive" });
  }
  for (const [flag, paths] of [
    ["--reference-eggo", request.referenceEggo],
    ["--reference-style", request.referenceStyle],
    ["--reference-robots", request.referenceRobots],
    ["--reference-props", request.referenceProps],
  ] as const) {
    for (const path of paths) {
      if (!existsSync(path)) invalid.push({ flag, value: path, reason: "reference path not found" });
    }
  }
  const promptText = [
    request.sectionTitle,
    request.sectionClaim,
    request.metaphorFocus,
    request.mustInclude.join(" "),
    request.mustAvoid.join(" "),
    request.visibleConsequence,
  ].join(" ").toLowerCase();
  const foundOldAnchor = oldStyleAnchors.find((anchor) => promptText.includes(anchor));
  if (foundOldAnchor) {
    messages.push(`Old contaminated style anchor detected: ${foundOldAnchor}. Remove it from request text.`);
  }
}

function validateSize(value: string, invalid: Array<{ flag: string; value?: string; reason: string }>) {
  if (value === "auto") return;
  const match = value.match(sizePattern);
  if (!match) {
    invalid.push({ flag: "--size", value, reason: "must be auto or WIDTHxHEIGHT" });
    return;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const pixels = width * height;
  if (width % 16 !== 0 || height % 16 !== 0) invalid.push({ flag: "--size", value, reason: "both edges must be multiples of 16" });
  if (long > 3840) invalid.push({ flag: "--size", value, reason: "max edge must be <= 3840" });
  if (long / short > 3) invalid.push({ flag: "--size", value, reason: "long-to-short ratio must be <= 3:1" });
  if (pixels < 655_360 || pixels > 8_294_400) invalid.push({ flag: "--size", value, reason: "total pixels must be between 655,360 and 8,294,400" });
}

function parseCsv(value: string): string[] {
  if (value.trim().toLowerCase() === "none") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function formatEggoResetFlagContract(name: string): string {
  return `Required reset flag contract:
${EGGO_RESET_FLAG_SPECS.map((spec) => `  ${spec.name} ${spec.placeholder}  ${spec.description}`).join("\n")}

Optional controls:
  --dry-run  Print prompt and audit receipt without generating.
  --run      Generate one comparison image.

Copyable template:
${name} \\
  --section-title "Make The Repo Agent-Ready" \\
  --section-claim "Agents work better when a repo exposes clear entrypoints, fast checks, and safe task boundaries." \\
  --audience-context "developers preparing a software project for Codex and imp workflows" \\
  --metaphor-focus "turn a confusing repo into a prepared environment where coding agents can safely understand, verify, and act" \\
  --must-include "repo entrypoint map,fast verification check,isolated task lane,agent handoff point,mini-eggo robot agents" \\
  --must-avoid "label-only decoration,generic app screen,abstract software wallpaper,mascot poster" \\
  --visible-consequence "a confused agent path becomes a safe repeatable route through docs tests tool gates and boundaries" \\
  --output-intent "one opaque comparison image for visual direction selection" \\
  --asset-slug "make-repo-agent-ready" \\
  --dry-run`;
}

export function formatEggoResetFlagFailure(result: Exclude<EggoResetParseResult, { ok: true }>, name: string): string {
  return `${name}: missing or invalid reset flags

No image generation was attempted.

${result.missing.length ? `Missing flags:\n${result.missing.map((flag) => `- ${flag}`).join("\n")}\n` : ""}${result.invalid.length ? `Invalid flags:\n${result.invalid.map((item) => `- ${item.flag}${item.value ? `=${item.value}` : ""}: ${item.reason}`).join("\n")}\n` : ""}${result.positionals.length ? `Unexpected positional prompts:\n${result.positionals.map((item) => `- ${item}`).join("\n")}\n` : ""}${result.messages.length ? `Validation messages:\n${result.messages.map((item) => `- ${item}`).join("\n")}\n` : ""}
${formatEggoResetFlagContract(name)}`;
}

export type VisualCausalityRow = {
  concept: string;
  prop: string;
  actor: string;
  action: string;
  consequence: string;
  forbiddenFake: string;
};

export function buildVisualCausalityContract(request: EggoResetRequest): VisualCausalityRow[] {
  const include = request.mustInclude;
  return include.map((concept, index) => ({
    concept,
    prop: propForConcept(concept),
    actor: index % 3 === 0 ? "Eggo" : index % 3 === 1 ? "mini-eggo robot agent" : "repo mechanism",
    action: actionForConcept(concept),
    consequence: request.visibleConsequence,
    forbiddenFake: `a sign, badge, crate, rail, or decorative label that merely says "${concept}"`,
  }));
}

function propForConcept(concept: string): string {
  const lower = concept.toLowerCase();
  if (lower.includes("environment") || lower.includes("maintenance bay")) return "prepared maintenance bay with safe lanes, docks, gates, work cells, and visible task flow";
  if (lower.includes("context") || lower.includes("packet") || lower.includes("manifest")) return "folder bundle, map packet, manifest card, manual, or cable-bound context pack";
  if (lower.includes("script") || lower.includes("command")) return "socketed command cartridge, plug-in adapter, terminal module, or tool head";
  if (lower.includes("handoff") || lower.includes("dock") || lower.includes("port")) return "handoff dock, tool port, transfer socket, or guarded threshold for a robot task";
  if (lower.includes("repo") || lower.includes("map")) return "physical repo map, folder tree, blueprint, or entrypoint port";
  if (lower.includes("test") || lower.includes("verification") || lower.includes("ci")) return "working gauge, test harness, latch, or CI gate";
  if (lower.includes("tool") || lower.includes("adapter") || lower.includes("cli")) return "socketed command adapter, plug-in tool module, probe, or wrench";
  if (lower.includes("boundary") || lower.includes("sandbox") || lower.includes("lane")) return "guarded lane, sandbox fence, permission barrier, or safe work cell";
  if (lower.includes("robot") || lower.includes("agent")) return "mini-eggo robot with tread base, antenna/sensor, glasses, and tool module";
  if (lower.includes("readme") || lower.includes("agent")) return "instruction card, manual page, or bolted rule plate";
  return "concrete workflow object with a contact point";
}

function actionForConcept(concept: string): string {
  const lower = concept.toLowerCase();
  if (lower.includes("environment") || lower.includes("maintenance bay")) return "organizes robots into safe work cells and controlled lanes";
  if (lower.includes("context") || lower.includes("packet") || lower.includes("manifest")) return "feeds the right bundle into the repo mechanism";
  if (lower.includes("script") || lower.includes("command")) return "clicks into a socket and drives a visible tool action";
  if (lower.includes("handoff") || lower.includes("dock") || lower.includes("port")) return "transfers a task packet or tool module to a robot";
  if (lower.includes("repo") || lower.includes("map")) return "opens, unfolds, scans, or reveals the route";
  if (lower.includes("test") || lower.includes("verification") || lower.includes("ci")) return "measures, gates, locks, unlocks, or validates";
  if (lower.includes("tool") || lower.includes("adapter") || lower.includes("cli")) return "plugs in, turns, probes, or drives a command";
  if (lower.includes("boundary") || lower.includes("sandbox") || lower.includes("lane")) return "blocks unsafe motion while allowing the safe path";
  if (lower.includes("robot") || lower.includes("agent")) return "moves through the prepared workflow and uses a tool";
  return "does visible work with a before/after result";
}

export function buildEggoResetPrompt(design: EggoResetDesign, request: EggoResetRequest, inputImages: string[]): string {
  const causality = buildVisualCausalityContract(request);
  const isReferenceSheet = design.id === "reference-sheet";
  const referenceSheetPrimitives = [
    "agentic environment maintenance bay",
    "script cartridge or command adapter",
    "context bundle, map, manifest, or packet",
    "verification gate/gauge/jig",
    "sandboxed task lane or safe work cell",
    "handoff dock or tool port",
  ];
  const visiblePrimitives = isReferenceSheet
    ? Array.from(new Set([...request.mustInclude, ...referenceSheetPrimitives]))
    : request.mustInclude;
  return `Use case: ${isReferenceSheet ? "infographic-diagram" : "illustration-story"}
Asset type: ${isReferenceSheet ? "reusable visual metaphor reference sheet for workshop section images" : "workshop section comparison image"}
Generation mode: new image, not an edit.
Reference image role map:
${inputImages.length ? inputImages.map((path, index) => `Image ${index + 1}: reference only; use only the role stated in the imp instructions. Path: ${path}`).join("\n") : "No reference images. Follow the written Eggo invariants exactly."}

Section title: "${request.sectionTitle}"
Section claim: "${request.sectionClaim}"
Audience: ${request.audienceContext}
Output intent: ${request.outputIntent}
Canvas: ${request.size}, ${request.background} background, quality intent ${request.quality}

Creative direction: ${design.displayName}
${design.promptFrame}

Style language:
${design.styleLanguage.map((item) => `- ${item}`).join("\n")}

Metaphor grammar:
${design.metaphorGrammar.map((item) => `- ${item}`).join("\n")}

Canonical Eggo invariants:
Eggo is an off-white egg character with thick black glasses, complete closed rims, visible side temples, blank face behind the lenses, no visible pupils or eyeballs, expressive floating brows, no mouth, no legs, no feet, no shoes, separated mitten hands with exactly three fingers plus thumb, and no arms, wrists, sleeves, or limb connectors.

Mini-eggo robot invariants:
Mini-eggo agents must read as robots first: small egg head, black glasses, compact wheeled or treaded metal body, antenna or sensor mast, chassis-mounted tool module, charging port or status light, no humanoid arms, no wrists, no sleeves, no hands, no fingers, no legs, no feet, no shoes, no mouths, no visible pupils or eyeballs.

Scene/backdrop:
${sceneBackdrop(design)}

Subject:
${isReferenceSheet ? "Canonical Eggo, mini-eggo robot agents, and reusable software-workflow metaphor objects for future section images." : "Canonical Eggo helps mini-eggo robot agents make a software repository agent-ready."}

Metaphor focus:
${request.metaphorFocus}

Required visible primitives:
${visiblePrimitives.map((item) => `- ${item}`).join("\n")}

Visual Causality Contract:
${causality.map((row) => `- concept: ${row.concept}
  concrete prop: ${row.prop}
  actor: ${row.actor}
  visible action: ${row.action}
  visible consequence: ${row.consequence}
  forbidden fake substitute: ${row.forbiddenFake}`).join("\n")}

Prop accountability rule:
Every important prop must have a visible function, contact point, and consequence. A label may clarify a real prop, but it may not be the only evidence. A word, sign, badge, crate, rail, trophy, or decorative label never counts as the object it names.

Visible consequence:
${request.visibleConsequence}

Constraints:
- Keep the image hand-drawn or diagrammatic according to the selected creative direction; do not render as photorealistic 3D, realistic product photography, cinematic miniature photography, or glossy game art.
- Do not use rejected decorative style shortcuts, mascot-poster composition, generic app screens, or abstract software wallpaper.
- Do not draw a generic SaaS dashboard, generic browser mockup, or abstract software wallpaper.
- Do not add speech bubbles, extra characters, weapons, trophies, or random decorative stars.
- Do not rely on text labels to carry the concept.
- Do not use green checkmarks, red X icons, trophy medals, or status badges as proof. Show proof through a working gate, gauge, latch, harness, or test jig.
- Keep in-image text sparse: no paragraph UI, no dense process headers, no large label banners, and ${isReferenceSheet ? "only concise specimen labels for the reusable vocabulary items" : "no more than five tiny object labels if needed"}.
${request.mustAvoid.map((item) => `- Avoid: ${sanitizeAvoidItem(item)}`).join("\n")}

Final quality gate:
The image fails if Eggo has visible pupils or a face inside the lenses, if mini-eggos look like eggs riding carts instead of robots, if mini robots have hands/fingers/arms instead of mounted tools, if the visual meaning depends on labels alone, if props are decorative, if proof is only a checkmark/status icon, or if the scene cannot be understood as "${request.sectionTitle}" at thumbnail size.`;
}

function sceneBackdrop(design: EggoResetDesign): string {
  switch (design.id) {
    case "editorial-metaphor":
      return "A clean off-white hand-drawn technical editorial page with one central repo-as-mechanism metaphor, ink and marker texture, and generous breathing room.";
    case "workflow-diagram":
      return "A clean flat instructional diagram on white or off-white with crisp arrows, sockets, ports, guarded lanes, and no decorative clutter.";
    case "agent-robots":
      return "A practical miniature repo maintenance bay on a clean workbench with strong silhouettes and visible robot tooling.";
    case "reference-sheet":
      return "A clean off-white reference sheet laid out as inspected object studies and small action vignettes, with no full poster scene and no decorative clutter.";
  }
}

function sanitizeAvoidItem(value: string): string {
  return value
    .replace(/pop[- ]western/gi, "rejected style")
    .replace(/candy[- ]colored/gi, "overdecorated")
    .replace(/cute crates/gi, "decorative containers")
    .replace(/\bcrates\b/gi, "decorative containers")
    .replace(/\brails\b/gi, "decorative lanes")
    .replace(/\bbadges\b/gi, "decorative medals")
    .replace(/signs pretending to be tools/gi, "label-only substitutes");
}

export function formatEggoResetDryRunReceipt(design: EggoResetDesign, request: EggoResetRequest, prompt: string, inputImages: string[]): string {
  return `Eggo reset dry run
imp: ${design.impName}
design: ${design.displayName}
size: ${request.size}
quality: ${request.quality}
background: ${request.background}
output_dir: ${request.outputDir}
asset_slug: ${request.assetSlug}

Reference role map:
${inputImages.length ? inputImages.map((path, index) => `- Image ${index + 1}: ${path}`).join("\n") : "- none"}

Visual Causality Contract:
${buildVisualCausalityContract(request).map((row) => `- ${row.concept} -> ${row.prop} -> ${row.actor} -> ${row.action}`).join("\n")}

Expanded prompt:
${prompt}`;
}
