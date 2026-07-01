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
6. Before chroma-keying, inspect the raw source and run the Eggo anatomy gates.
   - Hand gate: Assign each visible hand to Eggo-left or Eggo-right based on the shell side it could plausibly reach from. For front-facing Eggo, Eggo-left is viewer-right and Eggo-right is viewer-left. PASS only if visible hands form a plausible left/right pair, each hand's thumb/finger/palm orientation matches its assigned side, reach is short and reference-like, and no wrist flip or same-hand duplication is visible. FAIL if the hands read as two left hands, two right hands, duplicated default hands, impossible palm-side duplicates, wrong-side torso placement, broken wrist orientation, or overextended reach.
   - Arm gate: PASS only if Main Eggo has floating mitten hands with no visible arms. FAIL if Main Eggo has visible arms, forearms, elbows, wrists, sleeves, crossed-arm bands, white arm tubes, limb connector lines, or arm-like shapes connecting hands to the shell. Do not count mini-eggo robot mech/tool arms as an ARM_GATE failure; those robot arms are required accessories when attached to mini-eggo robots.
   - Footwear gate: PASS only if Main Eggo and all mini-eggo robots have no feet, shoes, footwear, boots, sneakers, sandals, soles, laces, toes, or shoe-like base shapes. Treads/wheels are allowed only as robot bases on mini-eggo robots and must not read as shoes.
   - Texture gate: PASS only if Main Eggo's egg body is a clean simple off-white cartoon shell with smooth fill and only broad soft shadow shapes. FAIL if the body shows egg-shell texture, paper grain, pencil hatching, contour hatch lines, scratchy oval strokes, speckles, realistic shell texture, or visible fiber/grain.
   Do not skip chroma-keying solely because the raw outer background is a close green-key color instead of exact #00ff00, or solely because the style is somewhat more polished than Image 1. Preserve those as audit warnings, normalize with an exact #00ff00 border, run chroma-keying, and let the final geometry/alpha metrics decide. If the raw source is opaque-background with no green-key field, is emotionally flat, falls back to the generic raised-fist plus orange-exclamation-burst pose when a different hand/expression was requested, has mismatched/repeated-default eyebrows, fails the hand gate, fails the arm gate, fails the footwear gate, fails the texture gate, contains foreground green/key-adjacent marks on subject matter, mini robots are not about one-quarter Main Eggo height, mini robots are not mostly visible white egg bodies, mini robots lack goggles/visor + wheels/treads + tiny mech arms, or any cord/cable/tether/hose/leash appears, preserve and report the raw source, skip chroma-keying, and do not present the image as successful.
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
- main Eggo ${request.mainEggoEmotion} pass/fail
- main Eggo represents human/controller pass/fail
- main Eggo hand pose matches requested expression pass/fail
- HAND_GATE: PASS/FAIL with one short reason
- hand side assignment Eggo-left/Eggo-right pass/fail
- hand thumb/finger/palm orientation plausible pass/fail
- hand reach short and reference-like pass/fail
- no duplicated same-side hands pass/fail
- ARM_GATE: PASS/FAIL with one short reason
- no visible arms/forearms/elbows/wrists/sleeves pass/fail
- no crossed-arm bands or limb connector lines pass/fail
- FOOTWEAR_GATE: PASS/FAIL with one short reason
- no shoes/footwear/feet/boots/sneakers/sandals pass/fail
- mini robot treads/wheels do not read as footwear pass/fail
- TEXTURE_GATE: PASS/FAIL with one short reason
- clean simple shell without egg texture/hatching/grain/contour lines pass/fail
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
