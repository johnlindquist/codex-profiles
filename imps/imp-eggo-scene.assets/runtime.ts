import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runImp } from "../../lib/isolated.ts";
import {
  buildEggoScenePrompt,
  buildPlacementPlan,
  formatDryRunReceipt,
  formatEggoFlagContract,
  formatEggoFlagFailure,
  parseEggoSceneCli,
  resolveEggoContinuity,
} from "./eggo-scene-contract.ts";

type EggoSceneConfig = {
  name: string;
  styleName?: string;
  styleSlug?: string;
  stylePrompt?: string;
  styleReferenceImage?: string;
  stylePriorityPrompt?: string;
  styleNegativePrompt?: string;
  styleReferenceFirst?: boolean;
  eggoReferenceImages?: string[];
};

const assetDir = dirname(fileURLToPath(import.meta.url));
const defaultEggoReferenceImageNames = [
  "263-kinetic-dodge-accessibility-imagegen-clean-no-texture.png",
  "04-overwhelmed-clean-no-texture.png",
  "14-proud-teacher-arm-free-imagegen-clean-no-texture.png",
];
const chromaKeyScript = join(assetDir, "scripts/remove-chroma-key.ts");

function eggoReferencePaths(config: EggoSceneConfig): string[] {
  const names = config.eggoReferenceImages ?? defaultEggoReferenceImageNames;
  return names.map((name) => join(assetDir, "references", name));
}

function styleReferencePath(config: EggoSceneConfig): string | undefined {
  return config.styleReferenceImage ? join(assetDir, "style-references", config.styleReferenceImage) : undefined;
}

function referenceInputs(paths: string[]) {
  return paths.map((path) => `- reference image: ${path}`).join("\n");
}

export function runEggoSceneImp(config: EggoSceneConfig) {
  const rawArgs = process.argv.slice(2);
  const help = rawArgs.includes("--help") || rawArgs.includes("-h");
  const passThrough = rawArgs.includes("--serve");
  const styleImagePath = styleReferencePath(config);
  const eggoReferences = eggoReferencePaths(config);
  const baseInputImages = styleImagePath
    ? config.styleReferenceFirst
      ? [styleImagePath, ...eggoReferences]
      : [...eggoReferences, styleImagePath]
    : eggoReferences;
  const styleOutputPrefix = config.styleSlug ? `imp-eggo-${config.styleSlug}` : "imp-eggo-scene";
  const selectedStyle = config.styleName ?? "Generic Eggo Scene";

  if (help) {
    console.log(`${config.name} - ${selectedStyle} transparent Eggo scene generator

Usage:
  ${config.name} [required Eggo scene flags] [optional controls]
  ${config.name} --serve

${formatEggoFlagContract(config.name)}`);
    process.exit(0);
  }

  const parsed = passThrough ? undefined : parseEggoSceneCli(rawArgs);
  if (parsed && !parsed.ok) {
    console.error(formatEggoFlagFailure(parsed, { name: config.name, styleName: config.styleName }));
    process.exit(2);
  }

  const continuity = parsed?.ok ? resolveEggoContinuity(parsed.request) : undefined;
  if (continuity && !continuity.ok) {
    console.error(formatEggoFlagFailure({
      ok: false,
      missing: [],
      invalid: continuity.invalid,
      unknown: [],
      positionals: [],
      messages: continuity.messages,
      values: parsed!.request,
    }, { name: config.name, styleName: config.styleName }));
    process.exit(2);
  }

  const inputImages = continuity?.ok ? [...baseInputImages, ...continuity.continuity.imagePaths] : baseInputImages;
  const placement = parsed?.ok ? buildPlacementPlan(parsed.request, config.styleSlug) : undefined;
  const expandedPrompt = parsed?.ok
    ? buildEggoScenePrompt({
        config,
        selectedStyle,
        inputImages,
        referenceImages: eggoReferences,
        styleImagePath,
        request: parsed.request,
        placement,
        continuity: continuity?.ok ? continuity.continuity : undefined,
      })
    : "";

  if (parsed?.ok && parsed.request.dryRun) {
    console.log(formatDryRunReceipt({
      config,
      selectedStyle,
      request: parsed.request,
      placement,
      expandedPrompt,
      inputImages,
      continuity: continuity?.ok ? continuity.continuity : undefined,
    }));
    process.exit(0);
  }

  if (parsed?.ok) {
    process.argv = [
      process.argv[0] ?? "bun",
      process.argv[1] ?? config.name,
      "Generate the transparent Eggo scene using only the parsed Eggo Scene Generation Contract in the developer instructions.",
    ];
  }

  runImp({
    name: config.name,
    enableImageGeneration: true,
    inputImages,
    baseInstructions: `You are ${config.name}, an Eggo scene image-generation agent. Generate a transparent-background hand-drawn Eggo scene from the parsed Eggo Scene Generation Contract. Use the attached Eggo reference images${styleImagePath ? " and the attached scene-style reference image" : ""}, chroma-key the outer background into a transparent PNG, and report the durable transparent asset path.`,
    developerInstructions: `You are ${config.name}, a focused Eggo scene generator.

## Operating Rule
Generate with the built-in image_gen workflow. Do not translate image generation into an imagegen shell command.

The Parsed Eggo Scene Generation Contract below is the only authoritative user request. Do not infer missing scene fields. Missing required flags are handled before this agent starts. Do not let style move, shrink, or defocus Eggo.

The clean Eggo reference sheets are attached to every cold SDK or interactive turn as local_image inputs. ${styleImagePath ? "A bundled scene-style reference image is also attached." : ""}

Every generation must follow the contract sections exactly, especially "Visual Style Priority Lock", "Root Placement Lock", "Transparent Background Contract", and "Post-Key Geometry Gate". A generic polished software-dashboard/vector result is a failed generation for style-specific wrappers.

${expandedPrompt || "No parsed Eggo scene contract is required for --help or --serve mode."}

## Required Output Workflow
After image_gen succeeds:
1. Find the generated image under $CODEX_HOME/generated_images or the path reported by the tool.
2. Create .notes if needed.
3. Copy the green-screen source to .notes/${styleOutputPrefix}-source-YYYYMMDD-HHMMSS.png.
4. Before chroma-keying, inspect the image. If it is vague, generic, not recognizably tied to the required flags, fails the Visual Style Priority Lock, looks like polished modern SaaS/dashboard/vector art, or violates Eggo's brand/anatomy constraints, report scene fail and do not present it as successful.
5. Run:
   bun "${chromaKeyScript}" --input ".notes/${styleOutputPrefix}-source-YYYYMMDD-HHMMSS.png" --out ".notes/${styleOutputPrefix}-transparent-YYYYMMDD-HHMMSS.png" --key-color "${parsed?.ok ? parsed.request.backgroundKey : "#00ff00"}" --tolerance ${parsed?.ok ? parsed.request.chromaTolerance : 18} --border-connected-only --remove-enclosed-key --protect-neutrals --despill
6. Validate with file/sips/identify. Parse the chroma-key script JSON and report opaqueBbox, opaqueBboxPct, marginPct, subjectCoveragePct, greenFringePct, and geometryGate. Do not claim success if a hard geometry gate fails. Also visually audit Eggo anatomy, complete glasses, no limbs, hand orientation, focus/framing, placement, and style match.

Return the durable transparent PNG path, source path, and concise audit:
- style used: ${selectedStyle}
- mode used
- references included
- continuity mode: ${continuity?.ok ? continuity.continuity.mode : "none"}
- selected continuity callouts represented pass/fail
- continuity identity preserved without copying old composition pass/fail
- continuity anti-contamination pass/fail
- selected placement variant: ${placement?.variant ?? "n/a"}
- required flags represented pass/fail
- Eggo anatomy pass/fail
- complete glasses frame pass/fail
- no arms/wrists/sleeves/limb connectors pass/fail
- canonical three-fingers-plus-thumb hand shape pass/fail
- hand orientation / no backwards hands pass/fail
- Eggo dimensional material/style match pass/fail
- seamless shell pass/fail
- scene pass/fail
- expressive camera pass/fail
- emotion readability pass/fail
- Eggo focus/framing pass/fail
- composition placement pass/fail
- contact/occlusion pass/fail
- visual style priority lock pass/fail
- style expression pass/fail
- user-prompt specificity pass/fail
- chroma-key pass/fail
- post-key geometry gate pass/fail
- known limitations

## Command Rules
Use only the $imagegen workflow and the bundled Bun chroma-key script for this task. Do not browse the web. Do not use ImageMagick, Python image processing, external cleanup scripts, or unbundled chroma tools. Do not edit files unless the user asks.

## Output
Be terse. Report the saved transparent PNG path and audit.`,
  });
}

export const eggoSceneReferenceInputs = referenceInputs;
