import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runImp } from "../../lib/isolated.ts";
import {
  buildEggoBoldLabPrompt,
  formatEggoBoldLabDryRunReceipt,
  formatEggoBoldLabFlagContract,
  formatEggoBoldLabFlagFailure,
  parseEggoBoldLabCli,
} from "./contract.ts";

const thisDir = dirname(fileURLToPath(import.meta.url));
const sceneAssetDir = join(thisDir, "..", "imp-eggo-scene.assets");
const chromaKeyScript = join(sceneAssetDir, "scripts", "remove-chroma-key.ts");
const defaultStyleReferences = [join(sceneAssetDir, "style-references", "eggo-lab-primary.png")];
const defaultEggoReferences = [
  join(sceneAssetDir, "references", "263-kinetic-dodge-accessibility-imagegen-clean-no-texture.png"),
  join(sceneAssetDir, "references", "14-proud-teacher-arm-free-imagegen-clean-no-texture.png"),
];

export function runEggoBoldLabImp(name = "imp-eggo-bold-lab") {
  const rawArgs = process.argv.slice(2);
  const help = rawArgs.includes("--help") || rawArgs.includes("-h");

  if (help) {
    console.log(`${name} - transparent bold-lab Eggo scene generator

Usage:
  ${name} [required bold-lab flags] [optional controls]

${formatEggoBoldLabFlagContract(name)}`);
    process.exit(0);
  }

  const parsed = parseEggoBoldLabCli(rawArgs);
  if (!parsed.ok) {
    console.error(formatEggoBoldLabFlagFailure(parsed, name));
    process.exit(2);
  }

  const request = parsed.request;
  const inputImages = Array.from(new Set([
    ...(request.referenceStyle.length ? request.referenceStyle : defaultStyleReferences),
    ...(request.referenceEggo.length ? request.referenceEggo : defaultEggoReferences),
  ]));
  const expandedPrompt = buildEggoBoldLabPrompt(request, inputImages);

  if (request.dryRun || !request.run) {
    console.log(formatEggoBoldLabDryRunReceipt(request, expandedPrompt, inputImages));
    process.exit(0);
  }

  mkdirSync(request.outputDir, { recursive: true });

  process.argv = [
    process.argv[0] ?? "bun",
    process.argv[1] ?? name,
    "Generate one transparent bold-lab Eggo image using the parsed prompt in developer instructions.",
  ];

  runImp({
    name,
    enableImageGeneration: true,
    inputImages,
    baseInstructions: `You are ${name}, an Eggo image-generation imp. Generate one image using the attached style reference as the visual authority, on a pure green-screen source, then chroma-key it to a transparent PNG.`,
    developerInstructions: `You are ${name}, a focused transparent Eggo bold-lab generator.

## Operating Rule
Use the built-in image_gen workflow. Do not translate image generation into a shell imagegen command.

The prompt below is the only user request. This imp exists specifically to avoid the failed opaque/isometric editorial direction.

## Bold-Lab Prompt
${expandedPrompt}

## Required Output Workflow
1. Generate exactly one source image using the built-in image_gen workflow.
2. The source image must have a flat uniform ${request.backgroundKey} outer background and a continuous green moat.
3. Find the generated image under $CODEX_HOME/generated_images or the path reported by the tool.
4. Create the output directory if needed: ${request.outputDir}
5. Copy the raw generated source to:
   ${request.outputDir}/${request.assetSlug}-source-YYYYMMDD-HHMMSS.png
6. Before chroma-keying, inspect the raw source. If it is opaque-background, does not visually follow Image 1, is emotionally flat, falls back to the generic raised-fist plus orange-exclamation-burst pose when a different hand/expression was requested, has mismatched/repeated-default eyebrows, mini robots are not about one-quarter Main Eggo height, mini robots are not mostly visible white egg bodies, mini robots lack goggles/visor + wheels/treads + tiny mech arms, or any cord/cable/tether/hose/leash appears, report failure and do not present it as successful.
7. Create a normalized green-screen source by placing the raw source on a larger pure ${request.backgroundKey} canvas before chroma-keying. Use ImageMagick when available:
   magick "${request.outputDir}/${request.assetSlug}-source-YYYYMMDD-HHMMSS.png" -bordercolor "${request.backgroundKey}" -border 220x220 "${request.outputDir}/${request.assetSlug}-normalized-source-YYYYMMDD-HHMMSS.png"
   If ImageMagick is unavailable, use any local PNG-capable tool to add a pure ${request.backgroundKey} border and save the same normalized-source path. Keep the raw source unchanged.
8. Run the bundled chroma-key script on the normalized source with the explicit key:
   bun "${chromaKeyScript}" --input "${request.outputDir}/${request.assetSlug}-normalized-source-YYYYMMDD-HHMMSS.png" --out "${request.outputDir}/${request.assetSlug}-transparent-YYYYMMDD-HHMMSS.png" --key-color "${request.backgroundKey}" --auto-key none --tolerance 18 --border-connected-only --remove-enclosed-key --protect-neutrals --despill
9. Validate with file/sips/identify when available. Parse the chroma-key script JSON and report opaqueBbox, opaqueBboxPct, marginPct, subjectCoveragePct, greenFringePct, and geometryGate. Do not claim success if a hard geometry gate fails.

## Audit Required
Report only:
- final transparent PNG path
- raw source green-screen PNG path
- normalized source green-screen PNG path
- asset kind: ${request.assetKind}
- style pass/fail
- follows Image 1 style reference pass/fail
- main Eggo joyful pass/fail
- main Eggo represents human/controller pass/fail
- main Eggo hand pose matches requested expression pass/fail
- main Eggo avoids generic raised-fist default pass/fail
- eyebrows match requested emotion pass/fail
- expression decorations vary beyond orange exclamation bursts pass/fail
- mini robots have goggles/visor pass/fail
- mini robots have wheels/treads pass/fail
- mini robots have tiny mech arms/tool arms pass/fail
- mini robots are about one-quarter Main Eggo height pass/fail
- mini robots are mostly visible white egg bodies pass/fail
- mini robots are wirelessly controlled by main Eggo pass/fail
- no cords/cables/tethers/hoses/leashes pass/fail
- no mini robot human hands/fingers pass/fail
- low complexity pass/fail
- centered sticker cluster with 15% empty border pass/fail
- green-screen moat pass/fail
- chroma-key pass/fail
- geometry gate pass/fail
- known limitations`,
  });
}
