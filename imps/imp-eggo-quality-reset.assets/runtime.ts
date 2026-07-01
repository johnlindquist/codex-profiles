import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, runImp } from "../../lib/isolated.ts";
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

function shouldOpenInteractiveInference(rawArgs: string[]) {
  if (!process.stdin.isTTY) return false;
  if (rawArgs.includes("--dry-run") || rawArgs.includes("--preview")) return false;
  return parseArgs(process.argv).interactive;
}

function normalizeInteractiveInferenceArgv(name: string) {
  return [
    process.argv[0] ?? "bun",
    process.argv[1] ?? name,
  ];
}

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
  const interactiveInference = !parsed.ok && shouldOpenInteractiveInference(rawArgs);
  if (!parsed.ok && !interactiveInference) {
    console.error(formatEggoResetFlagFailure(parsed, design.impName));
    process.exit(2);
  }

  const request = parsed.ok ? parsed.request : undefined;
  const inputImages = [
    ...(request?.referenceEggo.length ? request.referenceEggo : defaultEggoReferences),
    ...(request?.referenceStyle ?? []),
    ...(request?.referenceRobots ?? []),
    ...(request?.referenceProps ?? []),
  ];
  const expandedPrompt = request ? buildEggoResetPrompt(design, request, inputImages) : "";

  if (request && (request.dryRun || !request.run)) {
    console.log(formatEggoResetDryRunReceipt(design, request, expandedPrompt, inputImages));
    process.exit(0);
  }

  const outputDir = request?.outputDir ?? ".notes/eggo-reset-comparison";
  const assetSlug = request?.assetSlug ?? "<inferred-asset-slug>";

  if (request) {
    mkdirSync(request.outputDir, { recursive: true });
  }

  if (request) {
    process.argv = [
      process.argv[0] ?? "bun",
      process.argv[1] ?? design.impName,
      `Generate one ${design.displayName} comparison image using the reset prompt in the developer instructions.`,
    ];
  } else if (interactiveInference) {
    process.argv = normalizeInteractiveInferenceArgv(design.impName);
  }

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

## Interactive Prompt Inference Contract
This imp may be running without a parsed CLI flag contract because the user launched an interactive Codex TUI session. In that mode, the user's seeded prompt or next chat message is the authoritative creative brief.

Infer the missing contract values internally from the user's prompt, whether the prompt is one short phrase or a long detailed brief. Do not ask the user to provide CLI flags. Do not block just because section title, claim, audience, scene action, required objects, emotion, output slug, or other contract-shaped fields were not supplied as flags.

For a short prompt, choose conservative, literal defaults from the imp identity, selected reset style, attached references, and the visible nouns/verbs in the prompt. For a long prompt, extract explicit constraints first, then fill only the remaining gaps with conservative defaults.

If no user prompt was seeded, open the conversation by asking for the desired subject/use case in plain language. Do not ask for a flag list. After the user answers, infer the internal contract fields from that answer.

Treat inferred values as an internal working contract:
- title/header: infer from the topic or use a concise generated title
- claim/consequence: infer the intended before/after or message
- audience/context: infer from the prompt; default to developers using Codex/imps when unspecified
- scene/action/metaphor/primitives: choose concrete visible objects and actions, not label-only meaning
- emotion/gesture: choose an emotion and hand pose that visibly supports the prompt
- slug/output directory: choose a stable lowercase slug and the imp's default output directory

Never lower the visual quality gates because values were inferred. The inferred request must still create exactly one opaque comparison image, preserve canonical Eggo identity, make mini-eggos read as robots, show concrete workflow primitives with visible function/contact/consequence, and avoid label-only meaning.

## Reset Prompt
${expandedPrompt || "No parsed Reset Prompt is present. Infer an internal reset-comparison request from the interactive prompt using the Interactive Prompt Inference Contract above. Defaults: canvas 1536x1024; quality medium; opaque background; output directory .notes/eggo-reset-comparison; asset slug inferred from the prompt."}

## Required Output Workflow
1. Generate one opaque image with the built-in image_gen workflow.
2. Find the generated image under $CODEX_HOME/generated_images or the path reported by the tool.
3. Copy the selected generated image to:
   ${outputDir}/${assetSlug}-${design.id}.png
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
