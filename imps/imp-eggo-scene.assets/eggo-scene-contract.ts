import { dirname, extname, isAbsolute, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

export type EggoFlagKind = "string" | "enum" | "number" | "csv" | "boolean";

type CsvRule = {
  min?: number;
  allowNone?: boolean;
};

export type EggoFlagSpec = {
  name: string;
  property: keyof EggoSceneRequest;
  kind: EggoFlagKind;
  description: string;
  required?: boolean;
  enumValues?: string[];
  csv?: CsvRule;
  min?: number;
  max?: number;
  defaultValue?: string | number | boolean | string[];
  placeholder?: string;
};

export type EggoSceneRequest = {
  sectionHeader: string;
  sectionClaim: string;
  failureWithoutThis: string;
  audienceContext: string;
  sceneBrief: string;
  specificEntities: string[];
  sceneArtifacts: string[];
  focalPlace: string;
  eggoActivity: string;
  visibleConsequence: string;
  textLabels: string[];
  styleCompositionPlan: string;
  styleMaterialCues: string[];
  palettePlan: string;
  depthPlan: string;
  shotIntent: string;
  cameraAngle: string;
  placementVariant: PlacementVariant | "auto";
  placementRationale: string;
  eggoHeightPct: number;
  focusTarget: string;
  eggoEmotion: string;
  eyebrowPlan: string;
  glassesPlan: string;
  bodyLean: string;
  leftHandPose: string;
  leftHandOrientation: string;
  rightHandPose: string;
  rightHandOrientation: string;
  contactCues: string[];
  occlusionPlan: string;
  mustShow: string[];
  mustAvoid: string[];
  mode: string;
  backgroundKey: string;
  safeMarginPct: number;
  chromaTolerance: number;
  minSubjectCoveragePct: number;
  maxSubjectCoveragePct: number;
  maxGreenFringePct: number;
  dryRun: boolean;
  variantSeed: string;
  variationAxis: string;
  requestNotes: string;
  continuityManifest: string;
  carryOverIds: string[];
  continuityCurrentId: string;
  continuityStrictness: ContinuityStrictness;
  continuityMaxRefs: number;
};

export type ContinuityStrictness = "soft" | "normal" | "strict";

export type EggoParseFailure = {
  ok: false;
  missing: string[];
  invalid: { flag: string; value?: string; reason: string }[];
  unknown: string[];
  positionals: string[];
  messages: string[];
  values: Partial<EggoSceneRequest>;
};

export type EggoParseSuccess = {
  ok: true;
  request: EggoSceneRequest;
};

export type EggoParseResult = EggoParseSuccess | EggoParseFailure;

export type PlacementVariant =
  | "center-close"
  | "right-third-close"
  | "left-third-close"
  | "straight-on-center"
  | "profile-left"
  | "profile-right"
  | "dynamic-diagonal"
  | "upper-third-close";

export type PlacementPlan = {
  source: "forced" | "auto";
  variant: PlacementVariant;
  seed: string;
  bodyCenterPct: { x: number; y: number };
  faceCenterPct: { x: number; y: number };
  bodyBboxPct: { x: number; y: number; width: number; height: number };
  propBias: "left" | "right" | "behind" | "foreground" | "diagonal" | "below";
  forbiddenSlots: string[];
  instruction: string;
};

export type EggoContinuityManifestV1 = {
  schemaVersion: 1;
  setId: string;
  styleSlug?: string;
  previousImages: EggoContinuitySourceImage[];
  defaultDoNotCopy?: string[];
  carryoverPolicy?: {
    composition?: "do-not-copy" | "loose-motif";
    camera?: "new-scene" | "preserve-if-explicit";
    style?: "selected-wrapper-style-wins";
    anatomy?: "root-eggo-invariants-win";
    badArtifacts?: string[];
  };
};

export type EggoContinuitySourceImage = {
  id: string;
  path: string;
  role?: "previous-scene" | "entity-reference" | "prop-reference" | "style-evidence";
  notes?: string;
  knownDefects?: string[];
  callouts: EggoContinuityCallout[];
};

export type EggoContinuityCallout = {
  id: string;
  kind: "entity" | "action" | "prop" | "material" | "motif";
  label: string;
  priority?: "must" | "should";
  carry?: Array<"identity" | "role" | "action" | "material" | "palette" | "scale" | "motif">;
  visualIdentity?: {
    silhouette?: string;
    shape?: string;
    materials?: string[];
    palette?: string[];
    scale?: string;
    markings?: string;
  };
  role?: string;
  canonicalAction?: string;
  currentAction?: string;
  preserve?: string[];
  adapt?: string[];
  doNotCopy?: string[];
  sourceBoxPct?: { x: number; y: number; width: number; height: number };
  notes?: string;
};

export type EggoResolvedContinuity = {
  mode: "none" | "guided-set";
  manifestPath?: string;
  setId?: string;
  currentImageId: string;
  strictness: ContinuityStrictness;
  selectedCallouts: EggoResolvedContinuityCallout[];
  sourceImages: EggoResolvedContinuitySourceImage[];
  imagePaths: string[];
  globalDoNotCopy: string[];
  warnings: string[];
};

export type EggoResolvedContinuitySourceImage = {
  id: string;
  path: string;
  role?: string;
  knownDefects: string[];
};

export type EggoResolvedContinuityCallout = EggoContinuityCallout & {
  sourceImageId: string;
  sourceImagePath: string;
};

export type EggoContinuityResolveResult =
  | { ok: true; continuity: EggoResolvedContinuity }
  | { ok: false; invalid: EggoParseFailure["invalid"]; messages: string[] };

type PlacementDefinition = Omit<PlacementPlan, "source" | "variant" | "seed" | "bodyBboxPct">;

const depthPlanValues = ["flat-panel", "layered-paper", "compact-diorama", "stage-grid", "cutaway-ui", "storybook-depth", "style-native"];
const shotIntentValues = ["medium-close-up-hero", "reaction-close-up", "action-close-up", "wide-overview"];
const cameraAngleValues = [
  "front-three-quarter",
  "eye-level",
  "slight-low-angle-hero",
  "profile-graphic-panel",
  "straight-on-reaction",
  "dynamic-diagonal-action-crop",
  "style-specific-non-overhead",
  "overhead-tilted-face",
];
const placementVariantValues = ["auto", "center-close", "right-third-close", "left-third-close", "straight-on-center", "profile-left", "profile-right", "dynamic-diagonal", "upper-third-close"];
const focusTargetValues = ["glasses-eyebrows", "glasses-hands", "hand-prop-contact", "face-prop-overlap", "whole-body-action"];
const eggoEmotionValues = ["confident", "curious", "concerned", "surprised", "focused", "proud", "overwhelmed", "determined", "delighted", "skeptical"];
const bodyLeanValues = ["upright", "lean-left", "lean-right", "lean-forward", "lean-back", "squash-stretch"];
const handOrientationValues = ["palm", "back", "side", "hidden"];
const continuityStrictnessValues = ["soft", "normal", "strict"];
const continuityImageExtensions = [".png", ".jpg", ".jpeg", ".webp"];
const continuityPreserveHazards = [
  "green fringe",
  "green glow",
  "key color",
  "chroma",
  "seam",
  "crack",
  "split shell",
  "arm",
  "arms",
  "wrist",
  "wrists",
  "sleeve",
  "leg",
  "legs",
  "foot",
  "feet",
  "lower-left placement",
  "old camera angle",
  "isometric",
  "top-down",
];

export const EGGO_REQUIRED_FLAG_SPECS: EggoFlagSpec[] = [
  { name: "--section-header", property: "sectionHeader", kind: "string", required: true, placeholder: "<text>", description: "Exact article/section/header text this illustration supports." },
  { name: "--section-claim", property: "sectionClaim", kind: "string", required: true, placeholder: "<text>", description: "One-sentence claim the image must communicate." },
  { name: "--failure-without-this", property: "failureWithoutThis", kind: "string", required: true, placeholder: "<text>", description: "What the reader would misunderstand if the image missed the point." },
  { name: "--audience-context", property: "audienceContext", kind: "string", required: true, placeholder: "<text>", description: "Reader/context assumption." },
  { name: "--scene-brief", property: "sceneBrief", kind: "string", required: true, placeholder: "<literal scene premise>", description: "Literal visual premise. Do not put camera placement here." },
  { name: "--specific-entities", property: "specificEntities", kind: "csv", required: true, csv: { min: 2 }, placeholder: "<csv:min=2>", description: "Concrete nouns/metaphors from the concept." },
  { name: "--scene-artifacts", property: "sceneArtifacts", kind: "csv", required: true, csv: { min: 2 }, placeholder: "<csv:min=2>", description: "Visible surfaces/objects in the scene." },
  { name: "--focal-place", property: "focalPlace", kind: "string", required: true, placeholder: "<text>", description: "Actual place or surface Eggo occupies." },
  { name: "--eggo-activity", property: "eggoActivity", kind: "string", required: true, placeholder: "<verb phrase>", description: "Verb phrase for Eggo's action." },
  { name: "--visible-consequence", property: "visibleConsequence", kind: "string", required: true, placeholder: "<text>", description: "Visible local result of Eggo's action." },
  { name: "--text-labels", property: "textLabels", kind: "csv", required: true, csv: { allowNone: true }, placeholder: "<csv|none>", description: "Sparse readable labels, or \"none\"." },
  { name: "--style-composition-plan", property: "styleCompositionPlan", kind: "string", required: true, placeholder: "<text>", description: "How the selected wrapper style shapes the composition." },
  { name: "--style-material-cues", property: "styleMaterialCues", kind: "csv", required: true, csv: { min: 2 }, placeholder: "<csv:min=2>", description: "Material/rendering cues from the selected style." },
  { name: "--palette-plan", property: "palettePlan", kind: "string", required: true, placeholder: "<text>", description: "Subject palette plan; must avoid green/sage/teal key colors." },
  { name: "--depth-plan", property: "depthPlan", kind: "enum", required: true, enumValues: depthPlanValues, placeholder: "<enum>", description: "Spatial model for the compact scene." },
  { name: "--shot-intent", property: "shotIntent", kind: "enum", required: true, enumValues: shotIntentValues, placeholder: "<enum>", description: "Character-led shot type." },
  { name: "--camera-angle", property: "cameraAngle", kind: "enum", required: true, enumValues: cameraAngleValues, placeholder: "<enum>", description: "Camera/panel angle. Plain overhead, top-down, map-view, and isometric are not valid." },
  { name: "--placement-variant", property: "placementVariant", kind: "enum", required: true, enumValues: placementVariantValues, placeholder: "<enum>", description: "Root-owned placement variant. Use auto for deterministic root selection." },
  { name: "--placement-rationale", property: "placementRationale", kind: "string", required: true, placeholder: "<text>", description: "Why this placement supports the concept and avoids repeated lower-left/center-left staging." },
  { name: "--eggo-height-pct", property: "eggoHeightPct", kind: "number", required: true, min: 38, max: 58, placeholder: "<number:38..58>", description: "Target Eggo body height as percent of canvas height." },
  { name: "--focus-target", property: "focusTarget", kind: "enum", required: true, enumValues: focusTargetValues, placeholder: "<enum>", description: "What must read first at thumbnail size." },
  { name: "--eggo-emotion", property: "eggoEmotion", kind: "enum", required: true, enumValues: eggoEmotionValues, placeholder: "<enum>", description: "High-level emotion." },
  { name: "--eyebrow-plan", property: "eyebrowPlan", kind: "string", required: true, placeholder: "<text>", description: "Exact eyebrow angle/spacing/height." },
  { name: "--glasses-plan", property: "glassesPlan", kind: "string", required: true, placeholder: "<text>", description: "Lens tilt/shine/opacity/side-temple readability." },
  { name: "--body-lean", property: "bodyLean", kind: "enum", required: true, enumValues: bodyLeanValues, placeholder: "<enum>", description: "Body posture." },
  { name: "--left-hand-pose", property: "leftHandPose", kind: "string", required: true, placeholder: "<text|hidden>", description: "Left hand action or \"hidden\"." },
  { name: "--left-hand-orientation", property: "leftHandOrientation", kind: "enum", required: true, enumValues: handOrientationValues, placeholder: "<enum>", description: "Left hand palm/back/side/hidden orientation." },
  { name: "--right-hand-pose", property: "rightHandPose", kind: "string", required: true, placeholder: "<text|hidden>", description: "Right hand action or \"hidden\"." },
  { name: "--right-hand-orientation", property: "rightHandOrientation", kind: "enum", required: true, enumValues: handOrientationValues, placeholder: "<enum>", description: "Right hand palm/back/side/hidden orientation." },
  { name: "--contact-cues", property: "contactCues", kind: "csv", required: true, csv: { min: 1 }, placeholder: "<csv:min=1>", description: "Contact/overlap/shadow/framing cues." },
  { name: "--occlusion-plan", property: "occlusionPlan", kind: "string", required: true, placeholder: "<text>", description: "What overlaps, tucks behind, frames, or passes in front of Eggo." },
  { name: "--must-show", property: "mustShow", kind: "csv", required: true, csv: { min: 2 }, placeholder: "<csv:min=2>", description: "Request-specific details that must be visibly present." },
  { name: "--must-avoid", property: "mustAvoid", kind: "csv", required: true, csv: { allowNone: true }, placeholder: "<csv|none>", description: "Request-specific avoid list, or \"none\"." },
];

export const EGGO_OPTIONAL_FLAG_SPECS: EggoFlagSpec[] = [
  { name: "--mode", property: "mode", kind: "enum", enumValues: ["transparent-scene"], defaultValue: "transparent-scene", description: "Generation mode. Default: transparent-scene." },
  { name: "--background-key", property: "backgroundKey", kind: "string", defaultValue: "#00ff00", description: "Green-screen key color. Default: #00ff00." },
  { name: "--safe-margin-pct", property: "safeMarginPct", kind: "number", min: 0, max: 25, defaultValue: 8, description: "Minimum green moat around the opaque subject." },
  { name: "--chroma-tolerance", property: "chromaTolerance", kind: "number", min: 0, max: 255, defaultValue: 18, description: "Bundled chroma-key tolerance." },
  { name: "--min-subject-coverage-pct", property: "minSubjectCoveragePct", kind: "number", min: 0, max: 100, defaultValue: 12, description: "Post-key subject coverage lower bound." },
  { name: "--max-subject-coverage-pct", property: "maxSubjectCoveragePct", kind: "number", min: 0, max: 100, defaultValue: 78, description: "Post-key subject coverage upper bound." },
  { name: "--max-green-fringe-pct", property: "maxGreenFringePct", kind: "number", min: 0, max: 100, defaultValue: 0.35, description: "Post-key green fringe warning/failure threshold." },
  { name: "--dry-run", property: "dryRun", kind: "boolean", defaultValue: false, description: "Print the normalized contract and expanded prompt without generating." },
  { name: "--preview", property: "dryRun", kind: "boolean", defaultValue: false, description: "Alias for --dry-run." },
  { name: "--variant-seed", property: "variantSeed", kind: "string", defaultValue: "", description: "Stable seed for root-owned placement selection; not an image model seed." },
  { name: "--variation-axis", property: "variationAxis", kind: "string", defaultValue: "none", description: "Known flag name changed for this variation, e.g. eggo-emotion." },
  { name: "--request-notes", property: "requestNotes", kind: "string", defaultValue: "none", description: "Non-authoritative notes; cannot override required flags or Root Placement Lock." },
  { name: "--continuity-manifest", property: "continuityManifest", kind: "string", defaultValue: "", description: "Path to Eggo set-continuity JSON manifest. Enables guided previous-image carryover." },
  { name: "--carry-over", property: "carryOverIds", kind: "csv", csv: { allowNone: true }, defaultValue: [], placeholder: "<callout-id[,callout-id...]>", description: "Manifest callout IDs to preserve in this image. Required when --continuity-manifest is set." },
  { name: "--continuity-current-id", property: "continuityCurrentId", kind: "string", defaultValue: "", description: "Stable ID for this image inside the continuity set receipt. Defaults to the scene variant seed." },
  { name: "--continuity-strictness", property: "continuityStrictness", kind: "enum", enumValues: continuityStrictnessValues, defaultValue: "normal", description: "How strongly to fail continuity manifest hazards. Default: normal." },
  { name: "--continuity-max-refs", property: "continuityMaxRefs", kind: "number", min: 1, max: 5, defaultValue: 3, description: "Maximum previous-image references attached for one generation. Default: 3." },
];

const allSpecs = [...EGGO_REQUIRED_FLAG_SPECS, ...EGGO_OPTIONAL_FLAG_SPECS];
const specByName = new Map(allSpecs.map((spec) => [spec.name, spec]));

export const PLACEMENT_VARIANTS: Record<PlacementVariant, PlacementDefinition> = {
  "center-close": {
    bodyCenterPct: { x: 50, y: 54 },
    faceCenterPct: { x: 50, y: 41 },
    propBias: "behind",
    forbiddenSlots: ["lower-left", "center-left scenic foreground", "distant map view"],
    instruction: "Eggo is the central close subject; props wrap around or behind him.",
  },
  "right-third-close": {
    bodyCenterPct: { x: 64, y: 54 },
    faceCenterPct: { x: 64, y: 41 },
    propBias: "left",
    forbiddenSlots: ["lower-left", "center-left scenic foreground", "distant map view"],
    instruction: "Eggo anchors the right third at close range; core artifact occupies left/center.",
  },
  "left-third-close": {
    bodyCenterPct: { x: 36, y: 54 },
    faceCenterPct: { x: 36, y: 41 },
    propBias: "right",
    forbiddenSlots: ["lower-left", "center-left scenic foreground", "distant map view"],
    instruction: "Eggo anchors the left third at mid-height, not the lower-left foreground.",
  },
  "straight-on-center": {
    bodyCenterPct: { x: 50, y: 51 },
    faceCenterPct: { x: 50, y: 38 },
    propBias: "behind",
    forbiddenSlots: ["lower-left", "center-left scenic foreground", "overhead"],
    instruction: "Straight-on reaction composition; face/glasses dominate.",
  },
  "profile-left": {
    bodyCenterPct: { x: 57, y: 53 },
    faceCenterPct: { x: 55, y: 40 },
    propBias: "left",
    forbiddenSlots: ["lower-left", "distant map view", "flat unreadable profile"],
    instruction: "Profile/panel composition, but glasses and eyebrows remain readable.",
  },
  "profile-right": {
    bodyCenterPct: { x: 43, y: 53 },
    faceCenterPct: { x: 45, y: 40 },
    propBias: "right",
    forbiddenSlots: ["lower-left", "distant map view", "flat unreadable profile"],
    instruction: "Profile/panel composition, but glasses and eyebrows remain readable.",
  },
  "dynamic-diagonal": {
    bodyCenterPct: { x: 55, y: 50 },
    faceCenterPct: { x: 56, y: 38 },
    propBias: "diagonal",
    forbiddenSlots: ["lower-left path receding right", "center-left scenic foreground"],
    instruction: "Diagonal action crop; Eggo and artifact overlap in a close action read.",
  },
  "upper-third-close": {
    bodyCenterPct: { x: 50, y: 45 },
    faceCenterPct: { x: 50, y: 33 },
    propBias: "below",
    forbiddenSlots: ["lower-left", "bottom-heavy scenic foreground", "distant map view"],
    instruction: "Eggo sits higher than usual; artifact/contact cues support from below.",
  },
};

export function parseEggoSceneCli(argv: string[]): EggoParseResult {
  const values: Record<string, unknown> = {};
  const seen = new Set<string>();
  const unknown: string[] = [];
  const positionals: string[] = [];
  const invalid: EggoParseFailure["invalid"] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }
    const [flagName, inlineValue] = arg.includes("=") ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    const spec = specByName.get(flagName);
    if (!spec) {
      unknown.push(flagName);
      if (inlineValue === undefined && argv[i + 1] && !argv[i + 1].startsWith("-")) i++;
      continue;
    }

    seen.add(spec.name === "--preview" ? "--dry-run" : spec.name);
    let raw: string | boolean;
    if (spec.kind === "boolean") {
      raw = inlineValue === undefined ? true : inlineValue !== "false";
    } else {
      raw = inlineValue ?? argv[++i];
      if (raw === undefined) {
        invalid.push({ flag: flagName, reason: "requires a value" });
        continue;
      }
    }

    const parsed = parseValue(spec, raw);
    if (parsed.ok) {
      const existing = values[spec.property as string];
      if (spec.kind === "csv" && Array.isArray(existing)) {
        values[spec.property as string] = [...existing, ...(parsed.value as string[])];
      } else {
        values[spec.property as string] = parsed.value;
      }
    } else {
      invalid.push({ flag: flagName, value: String(raw), reason: parsed.reason });
    }
  }

  for (const spec of EGGO_OPTIONAL_FLAG_SPECS) {
    if (values[spec.property as string] === undefined && spec.defaultValue !== undefined) {
      values[spec.property as string] = Array.isArray(spec.defaultValue) ? [...spec.defaultValue] : spec.defaultValue;
    }
  }

  const missing = EGGO_REQUIRED_FLAG_SPECS
    .filter((spec) => !seen.has(spec.name))
    .map((spec) => spec.name);
  const messages: string[] = [];

  validateCrossFields(values, invalid, messages);

  if (positionals.length) messages.push("Unexpected positional prompt. Move content into --scene-brief, --focal-place, --eggo-activity, or --scene-artifacts.");
  if (unknown.length) messages.push(...unknown.map((flag) => `Unknown Eggo flag: ${flag}`));
  if (missing.length || invalid.length || unknown.length || positionals.length || messages.length) {
    return { ok: false, missing, invalid, unknown, positionals, messages, values: values as Partial<EggoSceneRequest> };
  }

  const request = values as unknown as EggoSceneRequest;
  if (!request.variantSeed || request.variantSeed === "") {
    request.variantSeed = stableKey([request.sectionHeader, request.sectionClaim, request.sceneBrief, request.eggoActivity]);
  }
  return { ok: true, request };
}

function parseValue(spec: EggoFlagSpec, raw: string | boolean): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (spec.kind === "boolean") return { ok: true, value: Boolean(raw) };
  const text = String(raw).trim();
  if (spec.kind === "string") return text ? { ok: true, value: text } : { ok: false, reason: "must not be empty" };
  if (spec.kind === "enum") {
    if (spec.enumValues?.includes(text)) return { ok: true, value: text };
    return { ok: false, reason: `must be one of: ${spec.enumValues?.join(", ")}` };
  }
  if (spec.kind === "number") {
    if (!/^-?\d+(\.\d+)?$/.test(text)) return { ok: false, reason: "must be a base-10 number without % or ranges" };
    const value = Number(text);
    if (!Number.isFinite(value)) return { ok: false, reason: "must be finite" };
    if (spec.min !== undefined && value < spec.min) return { ok: false, reason: `must be >= ${spec.min}` };
    if (spec.max !== undefined && value > spec.max) return { ok: false, reason: `must be <= ${spec.max}` };
    return { ok: true, value };
  }
  if (spec.kind === "csv") {
    if (text.toLowerCase() === "none" && spec.csv?.allowNone) return { ok: true, value: [] };
    const items = text.split(",").map((item) => item.trim()).filter(Boolean);
    if (spec.csv?.min !== undefined && items.length < spec.csv.min) return { ok: false, reason: `must include at least ${spec.csv.min} item(s)` };
    return { ok: true, value: items };
  }
  return { ok: false, reason: "unsupported flag kind" };
}

function validateCrossFields(values: Record<string, unknown>, invalid: EggoParseFailure["invalid"], messages: string[]) {
  const leftPose = values.leftHandPose as string | undefined;
  const leftOrientation = values.leftHandOrientation as string | undefined;
  const rightPose = values.rightHandPose as string | undefined;
  const rightOrientation = values.rightHandOrientation as string | undefined;
  validateHand("--left-hand", leftPose, leftOrientation, invalid);
  validateHand("--right-hand", rightPose, rightOrientation, invalid);
  if (leftPose === "hidden" && rightPose === "hidden") messages.push("At least one hand must be visible.");

  const variationAxis = values.variationAxis as string | undefined;
  if (variationAxis && variationAxis !== "none") {
    const normalized = variationAxis.startsWith("--") ? variationAxis : `--${variationAxis}`;
    if (!EGGO_REQUIRED_FLAG_SPECS.some((spec) => spec.name === normalized)) {
      invalid.push({ flag: "--variation-axis", value: variationAxis, reason: "must name a known required flag" });
    } else {
      values.variationAxis = normalized.slice(2);
    }
  }
}

function validateHand(prefix: string, pose: string | undefined, orientation: string | undefined, invalid: EggoParseFailure["invalid"]) {
  if (!pose || !orientation) return;
  if (pose === "hidden" && orientation !== "hidden") {
    invalid.push({ flag: `${prefix}-orientation`, value: orientation, reason: "must be hidden when matching hand pose is hidden" });
  }
  if (pose !== "hidden" && orientation === "hidden") {
    invalid.push({ flag: `${prefix}-orientation`, value: orientation, reason: "must be palm, back, or side when matching hand pose is visible" });
  }
}

export function formatEggoFlagFailure(result: EggoParseFailure, config: { name: string; styleName?: string }): string {
  const lines = [
    `${config.name}: missing or invalid required Eggo scene flags`,
    "",
    "No image generation was attempted.",
    `Selected style: ${config.styleName ?? "Generic Eggo Scene"}`,
  ];
  if (result.positionals.length) {
    lines.push("", `Unexpected positional prompt: ${result.positionals.join(" ")}`, "Eggo generation now requires explicit flags. Move this text into one or more fields: --scene-brief --focal-place --eggo-activity --scene-artifacts");
  }
  if (result.missing.length) lines.push("", `Missing required flags (${result.missing.length}):`, result.missing.join(" "));
  if (result.unknown.length) lines.push("", "Unknown flags:", ...result.unknown.map((flag) => `- ${flag}`));
  if (result.invalid.length) lines.push("", "Invalid flags:", ...result.invalid.map((item) => `- ${item.flag}${item.value !== undefined ? `=${item.value}` : ""}: ${item.reason}`));
  if (result.messages.length) lines.push("", "Validation messages:", ...result.messages.map((message) => `- ${message}`));
  lines.push("", formatEggoFlagContract(config.name));
  return lines.join("\n");
}

export function formatEggoFlagContract(commandName = "imp-eggo-scene"): string {
  const lines = ["Required Eggo flag contract:"];
  for (const spec of EGGO_REQUIRED_FLAG_SPECS) {
    const suffix = spec.enumValues ? ` Allowed: ${spec.enumValues.join(", ")}` : "";
    lines.push(`  ${spec.name} ${spec.placeholder ?? "<value>"}  ${spec.description}${suffix}`);
  }
  lines.push("", "Copyable template:", `${commandName} \\`);
  for (const spec of EGGO_REQUIRED_FLAG_SPECS) {
    const sample = sampleFor(spec);
    const continuation = spec === EGGO_REQUIRED_FLAG_SPECS.at(-1) ? "" : " \\";
    lines.push(`  ${spec.name} "${sample}"${continuation}`);
  }
  lines.push(
    "",
    "Optional controls:",
    "  --dry-run --preview --variant-seed <stable-string> --variation-axis <known-required-flag> --request-notes <non-authoritative text>",
    "Continuity controls:",
    "  --continuity-manifest <path.json> --carry-over <callout-id[,id]> [--continuity-current-id <id>] [--continuity-strictness soft|normal|strict] [--continuity-max-refs 1..5]",
  );
  return lines.join("\n");
}

function sampleFor(spec: EggoFlagSpec) {
  if (spec.name === "--text-labels" || spec.name === "--must-avoid") return "none";
  if (spec.name === "--placement-variant") return "auto";
  if (spec.name === "--eggo-height-pct") return "46";
  if (spec.enumValues?.length) return spec.enumValues[0];
  if (spec.kind === "csv") return "item one,item two";
  return spec.placeholder?.replace(/[<>]/g, "") || "value";
}

export function selectPlacementVariant(request: EggoSceneRequest, styleSlug = "generic"): { source: "forced" | "auto"; variant: PlacementVariant; seed: string } {
  if (request.placementVariant !== "auto") return { source: "forced", variant: request.placementVariant, seed: request.variantSeed };
  const choices = Object.keys(PLACEMENT_VARIANTS) as PlacementVariant[];
  const key = [styleSlug, request.sectionHeader, request.sectionClaim, request.sceneBrief, request.variantSeed].join("\n");
  return { source: "auto", variant: choices[hash32(key) % choices.length], seed: request.variantSeed };
}

export function buildPlacementPlan(request: EggoSceneRequest, styleSlug = "generic"): PlacementPlan {
  const selected = selectPlacementVariant(request, styleSlug);
  const definition = PLACEMENT_VARIANTS[selected.variant];
  const bodyHeight = request.eggoHeightPct;
  const bodyWidth = Number((bodyHeight / 1.25).toFixed(1));
  return {
    ...definition,
    ...selected,
    bodyBboxPct: {
      x: Number((definition.bodyCenterPct.x - bodyWidth / 2).toFixed(1)),
      y: Number((definition.bodyCenterPct.y - bodyHeight / 2).toFixed(1)),
      width: bodyWidth,
      height: bodyHeight,
    },
  };
}

export function resolveEggoContinuity(
  request: EggoSceneRequest,
  options: {
    cwd?: string;
    readFile?: (path: string) => string;
    exists?: (path: string) => boolean;
    resolvePath?: (path: string, baseDir?: string) => string;
  } = {},
): EggoContinuityResolveResult {
  const invalid: EggoParseFailure["invalid"] = [];
  const messages: string[] = [];
  const cwd = options.cwd ?? process.cwd();
  const readFile = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const exists = options.exists ?? existsSync;
  const resolvePath = options.resolvePath ?? ((path: string, baseDir = cwd) => isAbsolute(path) ? path : resolve(baseDir, path));
  const currentImageId = request.continuityCurrentId || request.variantSeed;

  if (!request.continuityManifest && request.carryOverIds.length === 0) {
    return {
      ok: true,
      continuity: {
        mode: "none",
        currentImageId,
        strictness: request.continuityStrictness,
        selectedCallouts: [],
        sourceImages: [],
        imagePaths: [],
        globalDoNotCopy: [],
        warnings: [],
      },
    };
  }

  if (!request.continuityManifest && request.carryOverIds.length > 0) {
    messages.push("--carry-over requires --continuity-manifest. Add --continuity-manifest ./eggo-set.json or remove --carry-over.");
  }
  if (request.continuityManifest && request.carryOverIds.length === 0) {
    messages.push("--continuity-manifest was provided, but --carry-over is empty. List one or more callout IDs, for example: --carry-over mini-eggo-robot-scout.");
  }
  if (messages.length) return { ok: false, invalid, messages };

  if (/^https?:\/\//i.test(request.continuityManifest)) {
    invalid.push({ flag: "--continuity-manifest", value: request.continuityManifest, reason: "must point to a local .json file. URLs are not supported in this slice" });
    return { ok: false, invalid, messages };
  }
  if (!request.continuityManifest.toLowerCase().endsWith(".json")) {
    invalid.push({ flag: "--continuity-manifest", value: request.continuityManifest, reason: "must point to a local .json file" });
    return { ok: false, invalid, messages };
  }

  const manifestPath = resolvePath(request.continuityManifest);
  if (!exists(manifestPath)) {
    invalid.push({ flag: "--continuity-manifest", value: request.continuityManifest, reason: `file not found: ${request.continuityManifest}` });
    return { ok: false, invalid, messages };
  }

  let manifest: EggoContinuityManifestV1;
  try {
    manifest = JSON.parse(readFile(manifestPath)) as EggoContinuityManifestV1;
  } catch (error) {
    invalid.push({ flag: "--continuity-manifest", value: request.continuityManifest, reason: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` });
    return { ok: false, invalid, messages };
  }

  validateManifestShape(manifest, invalid, messages);
  if (invalid.length || messages.length) return { ok: false, invalid, messages };

  const manifestDir = dirname(manifestPath);
  const calloutById = new Map<string, EggoResolvedContinuityCallout>();
  const sourceById = new Map<string, EggoResolvedContinuitySourceImage>();
  const globalDoNotCopy = [
    ...(manifest.defaultDoNotCopy ?? []),
    ...(manifest.carryoverPolicy?.badArtifacts ?? []),
  ];

  for (const [imageIndex, image] of manifest.previousImages.entries()) {
    const imagePath = resolvePath(image.path, manifestDir);
    if (!exists(imagePath)) invalid.push({ flag: "--continuity-manifest", value: image.path, reason: `previousImages[${image.id || imageIndex}].path not found: ${image.path}` });
    if (!isContinuityImagePath(image.path)) invalid.push({ flag: "--continuity-manifest", value: image.path, reason: `previousImages[${image.id || imageIndex}].path must be .png, .jpg, .jpeg, or .webp` });
    if (looksLikeGreenSource(image.path) && request.continuityStrictness !== "soft") {
      invalid.push({ flag: "--continuity-manifest", value: image.path, reason: `previousImages[${image.id || imageIndex}].path appears to be a green-screen source image. Use the transparent PNG output, not .notes/*-source-*.png` });
    }
    const sourceImage = {
      id: image.id,
      path: imagePath,
      role: image.role,
      knownDefects: image.knownDefects ?? [],
    };
    sourceById.set(image.id, sourceImage);
    globalDoNotCopy.push(...sourceImage.knownDefects);

    for (const callout of image.callouts) {
      if (calloutById.has(callout.id)) {
        invalid.push({ flag: "--continuity-manifest", value: callout.id, reason: `callout id ${callout.id} is duplicated. Callout IDs must be globally unique across the manifest` });
        continue;
      }
      validateCallout(callout, invalid);
      calloutById.set(callout.id, { ...callout, sourceImageId: image.id, sourceImagePath: imagePath });
    }
  }
  if (invalid.length) return { ok: false, invalid, messages };

  const selectedCallouts: EggoResolvedContinuityCallout[] = [];
  for (const id of request.carryOverIds) {
    const callout = calloutById.get(id);
    if (!callout) {
      invalid.push({ flag: "--carry-over", value: id, reason: `callout id not found. Available callout ids: ${[...calloutById.keys()].join(", ") || "none"}` });
    } else {
      selectedCallouts.push(callout);
    }
  }
  if (invalid.length) return { ok: false, invalid, messages };

  const sourceImages = uniqueBy(selectedCallouts.map((callout) => sourceById.get(callout.sourceImageId)).filter(Boolean) as EggoResolvedContinuitySourceImage[], (image) => image.id);
  if (sourceImages.length > request.continuityMaxRefs) {
    invalid.push({ flag: "--carry-over", value: request.carryOverIds.join(","), reason: `selected carryover uses ${sourceImages.length} source images but --continuity-max-refs is ${request.continuityMaxRefs}` });
    return { ok: false, invalid, messages };
  }

  return {
    ok: true,
    continuity: {
      mode: "guided-set",
      manifestPath,
      setId: manifest.setId,
      currentImageId,
      strictness: request.continuityStrictness,
      selectedCallouts,
      sourceImages,
      imagePaths: sourceImages.map((image) => image.path),
      globalDoNotCopy: uniqueStrings(globalDoNotCopy),
      warnings: [],
    },
  };
}

function validateManifestShape(manifest: EggoContinuityManifestV1, invalid: EggoParseFailure["invalid"], messages: string[]) {
  if (manifest.schemaVersion !== 1) invalid.push({ flag: "--continuity-manifest", reason: "schemaVersion must be 1" });
  if (!manifest.setId || !isStableId(manifest.setId)) invalid.push({ flag: "--continuity-manifest", value: manifest.setId, reason: "setId must be a stable slug: letters, numbers, dot, underscore, or dash" });
  if (!Array.isArray(manifest.previousImages) || manifest.previousImages.length === 0) messages.push("--continuity-manifest: previousImages must contain at least one image.");
  for (const [index, image] of (manifest.previousImages ?? []).entries()) {
    const label = image?.id || String(index);
    if (!image?.id || !isStableId(image.id)) invalid.push({ flag: "--continuity-manifest", value: image?.id, reason: `previousImages[${index}].id must be a stable slug: letters, numbers, dot, underscore, or dash` });
    if (!image?.path || typeof image.path !== "string") invalid.push({ flag: "--continuity-manifest", reason: `previousImages[${label}].path is required` });
    if (!Array.isArray(image?.callouts) || image.callouts.length === 0) invalid.push({ flag: "--continuity-manifest", reason: `previousImages[${label}].callouts must include at least one callout` });
  }
}

function validateCallout(callout: EggoContinuityCallout, invalid: EggoParseFailure["invalid"]) {
  if (!callout.id || !isStableId(callout.id)) invalid.push({ flag: "--continuity-manifest", value: callout.id, reason: "callout id must be a stable slug: letters, numbers, dot, underscore, or dash" });
  if (!["entity", "action", "prop", "material", "motif"].includes(callout.kind)) invalid.push({ flag: "--continuity-manifest", value: callout.kind, reason: `callout ${callout.id}: kind must be entity, action, prop, material, or motif` });
  if (!callout.label || typeof callout.label !== "string") invalid.push({ flag: "--continuity-manifest", value: callout.id, reason: `callout ${callout.id}: label is required` });
  if (callout.kind === "entity") {
    const identity = callout.visualIdentity;
    if (!identity?.silhouette || (!identity.materials?.length && !identity.palette?.length)) {
      invalid.push({ flag: "--continuity-manifest", value: callout.id, reason: `callout ${callout.id}: entity callouts require visualIdentity.silhouette and at least one of visualIdentity.materials or visualIdentity.palette` });
    }
  }
  if (callout.kind === "action" && !callout.canonicalAction) {
    invalid.push({ flag: "--continuity-manifest", value: callout.id, reason: `callout ${callout.id}: action callouts require canonicalAction` });
  }
  for (const [index, preserve] of (callout.preserve ?? []).entries()) {
    const hazard = hasPreserveHazard(preserve);
    if (hazard) {
      invalid.push({ flag: "--continuity-manifest", value: preserve, reason: `callout ${callout.id} preserve[${index}]="${preserve}" describes a known anatomy/contamination hazard (${hazard}). Move it to doNotCopy or rewrite it as a safe identity cue` });
    }
  }
  if (callout.sourceBoxPct) {
    const { x, y, width, height } = callout.sourceBoxPct;
    const valid = [x, y, width, height].every((value) => Number.isFinite(value) && value >= 0 && value <= 100) && x + width <= 100 && y + height <= 100;
    if (!valid) invalid.push({ flag: "--continuity-manifest", value: callout.id, reason: `callout ${callout.id}: sourceBoxPct must use numbers from 0..100 and x+width/y+height must stay within 100` });
  }
}

function isStableId(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value);
}

function isContinuityImagePath(value: string): boolean {
  return continuityImageExtensions.includes(extname(value).toLowerCase());
}

function looksLikeGreenSource(value: string): boolean {
  return /(^|[-_/])source[-_]/i.test(value) || /[-_]source[-_]\d/i.test(value);
}

function hasPreserveHazard(value: string): string | undefined {
  const lower = value.toLowerCase();
  return continuityPreserveHazards.find((hazard) => lower.includes(hazard));
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(item);
  }
  return out;
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

export function buildEggoScenePrompt(input: {
  config: { styleName?: string; stylePrompt?: string; stylePriorityPrompt?: string; styleNegativePrompt?: string };
  selectedStyle: string;
  inputImages: string[];
  referenceImages: string[];
  styleImagePath?: string;
  request: EggoSceneRequest;
  placement: PlacementPlan;
  continuity?: EggoResolvedContinuity;
}): string {
  const { request, placement, selectedStyle } = input;
  const continuity = input.continuity ?? emptyContinuity(request);
  return `# Eggo Scene Generation Contract

## Visual Style Priority Lock
selected_style: ${selectedStyle}
style_reference_image_role: ${input.styleImagePath ? "PRIMARY visual grammar source. Use it for shape language, line behavior, composition energy, selected style prop/world grammar, and color blocking. Do not copy its characters, text, dialogue, or exact panel layout." : "none"}
style_priority_prompt: ${input.config.stylePriorityPrompt ?? input.config.stylePrompt ?? "default hand-drawn Eggo scene"}
style_negative_prompt: ${input.config.styleNegativePrompt ?? "Do not make a generic polished vector illustration, generic app dashboard, generic SaaS UI, isometric tech scene, or glossy modern product graphic."}
hard_style_gate: If the image reads first as generic polished software/dashboard art instead of the selected style, the generation fails even if Eggo anatomy and chroma-key gates pass.

## Required Flag Receipt
selected_style: ${selectedStyle}
variation_axis: ${request.variationAxis}
variant_seed: ${request.variantSeed}
${EGGO_REQUIRED_FLAG_SPECS.map((spec) => `${toSnake(String(spec.property))}: ${formatValue(request[spec.property])}`).join("\n")}

## Input Images And Style Source
style_reference_image: ${input.styleImagePath ?? "none"}
eggo_identity_references:
${input.referenceImages.map((image) => `- ${image}`).join("\n")}
all_attached_images_in_order:
${input.inputImages.map((image) => `- reference image: ${image}`).join("\n")}
style_prompt: ${input.config.stylePrompt ?? "default hand-drawn Eggo scene"}

${formatContinuityPromptSection(continuity)}

## Section Intent
section_header: ${request.sectionHeader}
section_claim: ${request.sectionClaim}
failure_without_this: ${request.failureWithoutThis}
audience_context: ${request.audienceContext}

## Literal Scene Plan
scene_brief: ${request.sceneBrief}
specific_entities: ${request.specificEntities.join(", ")}
scene_artifacts: ${request.sceneArtifacts.join(", ")}
focal_place: ${request.focalPlace}
eggo_activity: ${request.eggoActivity}
visible_consequence: ${request.visibleConsequence}

## Style Composition
style_composition_plan: ${request.styleCompositionPlan}
style_material_cues: ${request.styleMaterialCues.join(", ")}
depth_plan: ${request.depthPlan}
The selected style owns visual language, material grammar, palette, world props, and mood. The shared root runtime owns Eggo identity, camera/focus, Eggo placement, transparent-background workflow, safe margins, verification, and failure gates. The selected style must adapt to the Root Placement Lock; it must not override Eggo scale, anchor, focus, or subject safe-zone requirements.

## Root Placement Lock
placement_source: ${placement.source}
selected_placement_variant: ${placement.variant}
placement_seed: ${placement.seed}
placement_rationale: ${request.placementRationale}
shot_intent: ${request.shotIntent}
camera_angle: ${request.cameraAngle}
focus_target: ${request.focusTarget}
eggo_body_height_pct: ${request.eggoHeightPct}
target_eggo_body_bbox_pct: x=${placement.bodyBboxPct.x} y=${placement.bodyBboxPct.y} w=${placement.bodyBboxPct.width} h=${placement.bodyBboxPct.height}
target_face_center_pct: x=${placement.faceCenterPct.x} y=${placement.faceCenterPct.y}
primary_artifact_bias: ${placement.propBias}
safe_margin_pct: ${request.safeMarginPct}
forbidden_slots: ${placement.forbiddenSlots.join(", ")}
hard_lock: Do not relocate Eggo to make room for scenery. Crop or simplify scenery instead. No prop, label, action line, shadow, sparkle, paper edge, UI panel, or scenery may touch a canvas edge.
variant_instruction: ${placement.instruction}

## Expressive Camera And Emotion
eggo_emotion: ${request.eggoEmotion}
eyebrow_plan: ${request.eyebrowPlan}
glasses_plan: ${request.glassesPlan}
body_lean: ${request.bodyLean}
Eggo's glasses, floating eyebrows, body lean, and mitten gesture must read at thumbnail size. Do not add eyes, mouth, nose, face marks, or lens markings.

## Eggo Action And Gesture
eggo_activity: ${request.eggoActivity}
left_hand_pose: ${request.leftHandPose}
left_hand_orientation: ${request.leftHandOrientation}
right_hand_pose: ${request.rightHandPose}
right_hand_orientation: ${request.rightHandOrientation}
Hands are oversized white cartoon gloves, each about 18-26% of egg body width, with exactly three rounded fingers plus one thumb when finger shapes are visible. Hands float close to the shell or overlap it directly; never add arms, wrists, sleeves, tubes, or thin limb lines.

## Physical Scene Contact
contact_cues: ${request.contactCues.join(", ")}
occlusion_plan: ${request.occlusionPlan}
visible_consequence: ${request.visibleConsequence}

## Text, Artifacts, And Palette
text_labels: ${request.textLabels.length ? request.textLabels.join(", ") : "none"}
scene_artifacts: ${request.sceneArtifacts.join(", ")}
palette_plan: ${request.palettePlan}
Avoid green, sage, teal-green, or key-adjacent colors anywhere in the subject.

## Eggo Scene Integration
Eggo must feel native to ${selectedStyle}, not like a separate sticker. Match the scene's line weight, shadow logic, local occlusion, palette temperature, and rendering style while preserving a clean white shell body.

## Eggo Character Invariants
Eggo is a WHITE egg shell mascot with compact rounded white shell body, oversized complete glasses with side temples when perspective exposes them, floating eyebrows, and separated smooth white mitten hands. Body height-to-width reads about 1.20-1.30x. No noisy eggshell texture, shell seams, center split, fold lines, cracks, eyes, pupils, mouth, nose, ears, arms, wrists, legs, feet, hats, costumes, speech bubbles, or dialogue balloons.

## Transparent Background Contract
background_key: ${request.backgroundKey}
chroma_tolerance: ${request.chromaTolerance}
The outer background must be one uniform ${request.backgroundKey} color with no shadows, gradients, texture, reflections, wall, room, card frame, or lighting variation. Leave a continuous flat ${request.backgroundKey} moat around the opaque subject.

## Request-Specific Must Show / Must Avoid
must_show: ${request.mustShow.join(", ")}
must_avoid: ${request.mustAvoid.length ? request.mustAvoid.join(", ") : "none"}

## Verification Checklist
- required flags are all represented above
- Visual Style Priority Lock is satisfied before generic scene polish
- Eggo focus/framing follows the Root Placement Lock
- composition placement avoids the forbidden slots
- glasses/eyebrows/hand gesture are readable
- hand orientation matches the gesture
- subject has safe transparent margins
- subject contains no key-adjacent greens
- output preserves Eggo brand anatomy
${continuity.mode === "guided-set" ? "- selected continuity callout IDs are visibly represented\n- continuity entities preserve listed identity cues without copying previous composition\n- continuity entities do not carry listed do_not_copy hazards\n- previous image camera angle, placement, crop, green artifacts, and bad anatomy were not copied" : ""}

## Post-Key Geometry Gate
expected_safe_margin_pct: ${request.safeMarginPct}
min_subject_coverage_pct: ${request.minSubjectCoveragePct}
max_subject_coverage_pct: ${request.maxSubjectCoveragePct}
max_green_fringe_pct: ${request.maxGreenFringePct}
After chroma-keying, parse the script JSON and report opaqueBbox, opaqueBboxPct, marginPct, subjectCoveragePct, greenFringePct, and geometryGate. Do not claim success if a hard geometry gate fails.

## Non-Authoritative Request Notes
${request.requestNotes}
`;
}

function emptyContinuity(request: EggoSceneRequest): EggoResolvedContinuity {
  return {
    mode: "none",
    currentImageId: request.continuityCurrentId || request.variantSeed,
    strictness: request.continuityStrictness,
    selectedCallouts: [],
    sourceImages: [],
    imagePaths: [],
    globalDoNotCopy: [],
    warnings: [],
  };
}

export function formatContinuityPromptSection(continuity: EggoResolvedContinuity): string {
  if (continuity.mode === "none") {
    return `## Set Continuity Source Map
continuity_mode: none
No previous-image continuity is requested for this scene.`;
  }
  return `## Set Continuity Source Map
continuity_mode: guided-set
continuity_set_id: ${continuity.setId}
current_image_id: ${continuity.currentImageId}
continuity_strictness: ${continuity.strictness}
Previous images are attached only as evidence for the selected callout IDs below. They are not style references, not camera references, not composition references, and not background references. The selected wrapper style and the root Eggo contract win over all previous-image evidence.
continuity_previous_images:
${continuity.sourceImages.map((image) => `- id=${image.id} path=${image.path} role=${image.role ?? "previous-scene"} known_defects=${image.knownDefects.length ? image.knownDefects.join("; ") : "none"}`).join("\n")}

## Continuity Carryover Contract
Carry over only these selected nouns/actions/entities. Preserve their recognizable identity tokens and role. Re-stage them naturally inside the current Literal Scene Plan, Physical Scene Contact, and Root Placement Lock. Do not trace, duplicate, or recreate the previous image.
${continuity.selectedCallouts.map(formatContinuityCallout).join("\n")}

## Continuity Anti-Contamination Lock
Previous images may contain visual mistakes. Do not carry over green-screen borders, green fringe, key-color glow, old background color, old crop, old camera angle, old isometric/top-down drift, old lower-left staging, old text labels, shell seams, cracks, arms, wrists, sleeves, tube limb connectors, legs, feet, incomplete glasses, backwards hands, or any known defect listed in the continuity manifest.
Continuity is identity guidance, not a license to override Eggo anatomy. If a continuity callout conflicts with Eggo Character Invariants, Root Placement Lock, Transparent Background Contract, Request-Specific Must Avoid, or Post-Key Geometry Gate, the root contract wins.
global_do_not_copy: ${continuity.globalDoNotCopy.length ? continuity.globalDoNotCopy.join("; ") : "none"}`;
}

function formatContinuityCallout(callout: EggoResolvedContinuityCallout): string {
  return `- carryover_id: ${callout.id}
  kind: ${callout.kind}
  label: ${callout.label}
  source_image_id: ${callout.sourceImageId}
  source_image_path: ${callout.sourceImagePath}
  source_region_pct: ${callout.sourceBoxPct ? `x=${callout.sourceBoxPct.x} y=${callout.sourceBoxPct.y} width=${callout.sourceBoxPct.width} height=${callout.sourceBoxPct.height}` : "unspecified"}
  continuity_target: ${callout.carry?.length ? callout.carry.join(", ") : "identity"}
  visual_identity: ${formatVisualIdentity(callout.visualIdentity)}
  role: ${callout.role ?? "unspecified"}
  canonical_action: ${callout.canonicalAction ?? "unspecified"}
  current_action: ${callout.currentAction ?? "adapt naturally to current scene"}
  preserve: ${callout.preserve?.length ? callout.preserve.join("; ") : "none"}
  adapt: ${callout.adapt?.length ? callout.adapt.join("; ") : "pose; facing direction; screen position; interaction with current scene artifacts"}
  do_not_copy: ${callout.doNotCopy?.length ? callout.doNotCopy.join("; ") : "none"}`;
}

function formatVisualIdentity(identity: EggoContinuityCallout["visualIdentity"]): string {
  if (!identity) return "unspecified";
  return [
    identity.silhouette,
    identity.shape,
    identity.materials?.join(", "),
    identity.palette?.join(", "),
    identity.scale,
    identity.markings,
  ].filter(Boolean).join("; ");
}

export function formatDryRunReceipt(input: {
  config: { name: string; styleName?: string };
  selectedStyle: string;
  request: EggoSceneRequest;
  placement: PlacementPlan;
  expandedPrompt: string;
  inputImages: string[];
  continuity?: EggoResolvedContinuity;
}) {
  const continuity = input.continuity ?? emptyContinuity(input.request);
  return `selected mode: Transparent Eggo Scene
selected style: ${input.selectedStyle}
selected placement variant: ${input.placement.variant} (${input.placement.source})
variant seed: ${input.placement.seed}
continuity mode: ${continuity.mode}
${continuity.mode === "guided-set" ? `continuity set id: ${continuity.setId}
continuity current image id: ${continuity.currentImageId}
selected carryover ids:
${continuity.selectedCallouts.map((callout) => `- ${callout.id} from ${callout.sourceImageId}`).join("\n")}
attached continuity image paths:
${continuity.imagePaths.map((image) => `- ${image}`).join("\n")}
continuity anti-contamination:
${continuity.globalDoNotCopy.map((item) => `- ${item}`).join("\n") || "- none"}
continuity blockers: none` : "continuity blockers: none"}

normalized required flag receipt:
${EGGO_REQUIRED_FLAG_SPECS.map((spec) => `- ${spec.name}: ${formatValue(input.request[spec.property])}`).join("\n")}

attached reference image paths:
${input.inputImages.map((image) => `- ${image}`).join("\n")}

intended generation surface: one transparent Eggo scene generated first on flat solid ${input.request.backgroundKey}, then chroma-keyed to transparent PNG.
blockers: none for prompt construction. Generation intentionally skipped because --dry-run/--preview was requested.

expanded final prompt:

\`\`\`text
${input.expandedPrompt}
\`\`\`
`;
}

function formatValue(value: unknown) {
  return Array.isArray(value) ? (value.length ? value.join(", ") : "none") : String(value);
}

function toSnake(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function stableKey(parts: string[]) {
  return hash32(parts.join("\n")).toString(16);
}

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
