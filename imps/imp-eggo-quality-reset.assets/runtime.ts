import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runImp } from "../../lib/isolated.ts";
import {
  type EggoResetDesign,
  buildEggoResetPrompt,
  formatEggoResetDryRunReceipt,
  formatEggoResetFlagContract,
  formatEggoResetFlagFailure,
  parseEggoResetCli,
} from "./contract.ts";

const thisDir = dirname(fileURLToPath(import.meta.url));
const eggoSceneAssetDir = join(thisDir, "..", "imp-eggo-scene.assets");
const defaultEggoReferences = [
  join(eggoSceneAssetDir, "references", "263-kinetic-dodge-accessibility-imagegen-clean-no-texture.png"),
  join(eggoSceneAssetDir, "references", "04-overwhelmed-clean-no-texture.png"),
  join(eggoSceneAssetDir, "references", "14-proud-teacher-arm-free-imagegen-clean-no-texture.png"),
];

export function runEggoQualityResetImp(design: EggoResetDesign) {
  const rawArgs = process.argv.slice(2);
  const help = rawArgs.includes("--help") || rawArgs.includes("-h");

  if (help) {
    console.log(`${design.impName} - ${design.displayName}

Usage:
  ${design.impName} [required reset flags] [optional controls]

${formatEggoResetFlagContract(design.impName)}`);
    process.exit(0);
  }

  const parsed = parseEggoResetCli(rawArgs);
  if (!parsed.ok) {
    console.error(formatEggoResetFlagFailure(parsed, design.impName));
    process.exit(2);
  }

  const request = parsed.request;
  const inputImages = [
    ...(request.referenceEggo.length ? request.referenceEggo : defaultEggoReferences),
    ...request.referenceStyle,
    ...request.referenceRobots,
    ...request.referenceProps,
  ];
  const expandedPrompt = buildEggoResetPrompt(design, request, inputImages);

  if (request.dryRun || !request.run) {
    console.log(formatEggoResetDryRunReceipt(design, request, expandedPrompt, inputImages));
    process.exit(0);
  }

  mkdirSync(request.outputDir, { recursive: true });

  process.argv = [
    process.argv[0] ?? "bun",
    process.argv[1] ?? design.impName,
    `Generate one ${design.displayName} comparison image using the reset prompt in the developer instructions.`,
  ];

  runImp({
    name: design.impName,
    enableImageGeneration: true,
    inputImages,
    baseInstructions: `You are ${design.impName}, an isolated Eggo image-generation imp for a quality reset. Generate exactly one opaque comparison image. Do not use the old imp-eggo-scene prompt wall, old style references, or prior failed outputs.`,
    developerInstructions: `You are ${design.impName}, a focused image-generation agent.

## Operating Rule
Use the built-in image_gen workflow. Do not translate this into a shell imagegen command.

This is a clean reset imp. Do not use any old pop-western, game-show, badge/crate/rail, or decorative label style.

Attached images are identity references only unless their role is explicitly stated in the prompt. The first default references are canonical Eggo identity references. Do not copy their composition.

## Reset Prompt
${expandedPrompt}

## Required Output Workflow
1. Generate one opaque image with the built-in image_gen workflow.
2. Find the generated image under $CODEX_HOME/generated_images or the path reported by the tool.
3. Copy the selected generated image to:
   ${request.outputDir}/${request.assetSlug}-${design.id}.png
4. Validate visually before reporting success:
   - canonical Eggo preserved
   - mini-eggos read as robots, not eggs in carts
   - at least three required workflow primitives are visible
   - every major prop has a visible function/contact/consequence
   - no signs, labels, badges, crates, or rails carry the meaning by themselves
   - output does not resemble the rejected pop-western/game-show style

## Output
Report only:
- final image path
- source generated image path
- concise pass/fail audit for the validation bullets
- known limitations`,
  });
}

