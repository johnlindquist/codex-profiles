import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EGGO_REQUIRED_FLAG_SPECS,
  buildEggoScenePrompt,
  buildPlacementPlan,
  formatDryRunReceipt,
  formatEggoFlagFailure,
  parseEggoSceneCli,
  resolveEggoContinuity,
} from "../imps/imp-eggo-scene.assets/eggo-scene-contract.ts";

const baseValues: Record<string, string> = {
  "--section-header": "Recovering Lost Context Before A Deployment",
  "--section-claim": "Recovering context before deploy prevents brittle releases.",
  "--failure-without-this": "Readers may think deployment failures are random instead of context gaps.",
  "--audience-context": "developer reading an agentic workflow article",
  "--scene-brief": "Eggo restores missing deployment context on a compact comic review console.",
  "--specific-entities": "deployment context,release checklist",
  "--scene-artifacts": "terminal,diff panel,release checklist",
  "--focal-place": "inside a pop western deployment console",
  "--eggo-activity": "pinning missing context cards back onto a deploy plan",
  "--visible-consequence": "the warning path turns into a readable release sequence",
  "--text-labels": "logs,diff,deploy",
  "--style-composition-plan": "flat comic action panel with bold starbursts and diagonal UI cards",
  "--style-material-cues": "thick ink outlines,flat cel shading",
  "--palette-plan": "hot pink cyan lemon yellow navy white rust with no green subject props",
  "--depth-plan": "flat-panel",
  "--shot-intent": "action-close-up",
  "--camera-angle": "front-three-quarter",
  "--placement-variant": "right-third-close",
  "--placement-rationale": "right-third close-up puts Eggo opposite the workflow board and avoids lower-left scenic staging",
  "--eggo-height-pct": "46",
  "--focus-target": "glasses-hands",
  "--eggo-emotion": "focused",
  "--eyebrow-plan": "pinched upward eyebrows showing urgent concentration",
  "--glasses-plan": "large glossy lenses tilted toward the workflow board with visible side temples",
  "--body-lean": "lean-forward",
  "--left-hand-pose": "holding a plan card",
  "--left-hand-orientation": "side",
  "--right-hand-pose": "open palm stopping deployment",
  "--right-hand-orientation": "palm",
  "--contact-cues": "card overlaps mitten,console shadow",
  "--occlusion-plan": "context cards tuck behind one mitten and overlap the console edge",
  "--must-show": "missing context card,deploy checklist",
  "--must-avoid": "green props,lower-left scenic staging",
};

function argv(overrides: Record<string, string> = {}, extra: string[] = []) {
  const values = { ...baseValues, ...overrides };
  return [
    ...EGGO_REQUIRED_FLAG_SPECS.flatMap((spec) => [spec.name, values[spec.name]]),
    ...extra,
  ];
}

function continuityFixture(options: { preserve?: string[]; imageName?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "eggo-continuity-"));
  const image = join(dir, options.imageName ?? "intro-transparent.png");
  writeFileSync(image, "fake image bytes");
  const manifest = join(dir, "eggo-set.json");
  writeFileSync(manifest, JSON.stringify({
    schemaVersion: 1,
    setId: "deploy-context-blog-eggo-set",
    previousImages: [{
      id: "intro-panel",
      path: image,
      role: "previous-scene",
      knownDefects: ["green fringe", "lower-left staging"],
      callouts: [{
        id: "mini-eggo-robot-scout",
        kind: "entity",
        label: "mini-eggo robot scout",
        carry: ["identity", "role", "scale"],
        visualIdentity: {
          silhouette: "tiny rounded egg-capsule robot",
          materials: ["white ceramic shell", "black visor"],
          palette: ["white", "black", "yellow"],
          scale: "one-third Eggo height",
        },
        role: "assistant robot that finds missing context",
        canonicalAction: "scans missing context",
        currentAction: "highlights the missing deployment note",
        preserve: options.preserve ?? ["egg-capsule silhouette", "black visor", "yellow antenna light"],
        adapt: ["pose", "screen position", "facing direction"],
        doNotCopy: ["old lower-left placement", "green fringe", "arms", "wrists"],
        sourceBoxPct: { x: 70, y: 52, width: 16, height: 22 },
      }],
    }],
    defaultDoNotCopy: ["previous camera angle", "previous composition", "shell seams"],
  }, null, 2));
  return { dir, image, manifest };
}

describe("Eggo scene required flag contract", () => {
  test("missing flags fail before generation with a full copyable contract", () => {
    const result = parseEggoSceneCli([]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected parse failure");
    expect(result.missing.length).toBe(EGGO_REQUIRED_FLAG_SPECS.length);
    const message = formatEggoFlagFailure(result, { name: "imp-eggo-pop-western", styleName: "Pop Western" });
    expect(message).toContain("No image generation was attempted.");
    expect(message).toContain("Required Eggo flag contract:");
    expect(message).toContain("--section-header <text>");
    expect(message).toContain("--placement-variant <enum>");
    expect(message).toContain("Copyable template:");
  });

  test("positional prompts and unknown flags are rejected", () => {
    const result = parseEggoSceneCli(["make eggo in a cool scene", "--not-real", "value"]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected parse failure");
    expect(result.positionals).toEqual(["make eggo in a cool scene"]);
    expect(result.unknown).toContain("--not-real");
    expect(result.messages.join("\n")).toContain("Unexpected positional prompt");
  });

  test("valid flags normalize csv, optional controls, and forced placement", () => {
    const result = parseEggoSceneCli(argv({}, ["--dry-run", "--variation-axis", "eggo-emotion"]));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    expect(result.request.sceneArtifacts).toEqual(["terminal", "diff panel", "release checklist"]);
    expect(result.request.dryRun).toBe(true);
    expect(result.request.variationAxis).toBe("eggo-emotion");
    const placement = buildPlacementPlan(result.request, "pop-western");
    expect(placement.source).toBe("forced");
    expect(placement.variant).toBe("right-third-close");
    expect(placement.bodyBboxPct.x).toBeGreaterThan(40);
    expect(placement.forbiddenSlots).toContain("lower-left");
  });

  test("invalid enum, numeric range, and hand consistency fail", () => {
    const result = parseEggoSceneCli(argv({
      "--shot-intent": "overhead",
      "--eggo-height-pct": "70",
      "--left-hand-pose": "hidden",
      "--left-hand-orientation": "palm",
      "--right-hand-pose": "hidden",
      "--right-hand-orientation": "hidden",
    }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected parse failure");
    expect(result.invalid.map((item) => item.flag)).toEqual(expect.arrayContaining(["--shot-intent", "--eggo-height-pct", "--left-hand-orientation"]));
    expect(result.messages).toContain("At least one hand must be visible.");
  });

  test("auto placement is deterministic and avoids the old scenic staging lock-in", () => {
    const first = parseEggoSceneCli(argv({ "--placement-variant": "auto" }, ["--variant-seed", "stable-1"]));
    const second = parseEggoSceneCli(argv({ "--placement-variant": "auto" }, ["--variant-seed", "stable-1"]));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("expected parse success");
    const a = buildPlacementPlan(first.request, "wildermyth");
    const b = buildPlacementPlan(second.request, "wildermyth");
    expect(a.variant).toBe(b.variant);
    expect(a.forbiddenSlots.join(",")).not.toContain("allowed lower-left");
  });

  test("expanded prompt maps every required flag into Oracle's section structure", () => {
    const result = parseEggoSceneCli(argv());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const placement = buildPlacementPlan(result.request, "pop-western");
    const prompt = buildEggoScenePrompt({
      config: { styleName: "Pop Western", stylePrompt: "bold flat western cartoon pop action" },
      selectedStyle: "Pop Western",
      inputImages: ["eggo-ref.png", "style-ref.png"],
      referenceImages: ["eggo-ref.png"],
      styleImagePath: "style-ref.png",
      request: result.request,
      placement,
    });
    expect(prompt).toContain("# Eggo Scene Generation Contract");
    expect(prompt).toContain("## Required Flag Receipt");
    expect(prompt).toContain("## Root Placement Lock");
    expect(prompt).toContain("section_header: Recovering Lost Context Before A Deployment");
    expect(prompt).toContain("selected_placement_variant: right-third-close");
    expect(prompt).toContain("target_eggo_body_bbox_pct:");
    expect(prompt).toContain("complete glasses with side temples");
    expect(prompt).not.toContain("{section_header}");
  });

  test("continuity manifest selects callouts and appends previous image refs", () => {
    const { manifest, image } = continuityFixture();
    const result = parseEggoSceneCli(argv({}, [
      "--continuity-manifest", manifest,
      "--carry-over", "mini-eggo-robot-scout",
      "--continuity-current-id", "deploy-context-03",
    ]));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const continuity = resolveEggoContinuity(result.request);
    expect(continuity.ok).toBe(true);
    if (!continuity.ok) throw new Error("expected continuity success");
    expect(continuity.continuity.mode).toBe("guided-set");
    expect(continuity.continuity.currentImageId).toBe("deploy-context-03");
    expect(continuity.continuity.imagePaths).toEqual([image]);
    expect(continuity.continuity.selectedCallouts[0].id).toBe("mini-eggo-robot-scout");
  });

  test("continuity manifest requires explicit carry-over ids", () => {
    const { manifest } = continuityFixture();
    const result = parseEggoSceneCli(argv({}, ["--continuity-manifest", manifest]));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const continuity = resolveEggoContinuity(result.request);
    expect(continuity.ok).toBe(false);
    if (continuity.ok) throw new Error("expected continuity failure");
    expect(continuity.messages.join("\n")).toContain("--carry-over");
    expect(continuity.messages.join("\n")).toContain("mini-eggo-robot-scout");
  });

  test("unknown carry-over id fails with available ids", () => {
    const { manifest } = continuityFixture();
    const result = parseEggoSceneCli(argv({}, [
      "--continuity-manifest", manifest,
      "--carry-over", "not-real",
    ]));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const continuity = resolveEggoContinuity(result.request);
    expect(continuity.ok).toBe(false);
    if (continuity.ok) throw new Error("expected continuity failure");
    expect(continuity.invalid[0].reason).toContain("not found");
    expect(continuity.invalid[0].reason).toContain("mini-eggo-robot-scout");
  });

  test("continuity preserve hazards fail before generation", () => {
    const { manifest } = continuityFixture({ preserve: ["tiny robot silhouette", "thin robot arms"] });
    const result = parseEggoSceneCli(argv({}, [
      "--continuity-manifest", manifest,
      "--carry-over", "mini-eggo-robot-scout",
    ]));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const continuity = resolveEggoContinuity(result.request);
    expect(continuity.ok).toBe(false);
    if (continuity.ok) throw new Error("expected continuity failure");
    expect(continuity.invalid[0].reason).toContain("known anatomy/contamination hazard");
    expect(continuity.invalid[0].reason).toContain("doNotCopy");
  });

  test("continuity prompt preserves identity without copying composition", () => {
    const { manifest, image } = continuityFixture();
    const result = parseEggoSceneCli(argv({}, [
      "--continuity-manifest", manifest,
      "--carry-over", "mini-eggo-robot-scout",
    ]));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const continuity = resolveEggoContinuity(result.request);
    expect(continuity.ok).toBe(true);
    if (!continuity.ok) throw new Error("expected continuity success");
    const placement = buildPlacementPlan(result.request, "pop-western");
    const prompt = buildEggoScenePrompt({
      config: { styleName: "Pop Western", stylePrompt: "bold flat western cartoon pop action" },
      selectedStyle: "Pop Western",
      inputImages: ["eggo-ref.png", "style-ref.png", ...continuity.continuity.imagePaths],
      referenceImages: ["eggo-ref.png"],
      styleImagePath: "style-ref.png",
      request: result.request,
      placement,
      continuity: continuity.continuity,
    });
    expect(continuity.continuity.imagePaths).toEqual([image]);
    expect(prompt).toContain("## Set Continuity Source Map");
    expect(prompt).toContain("continuity_mode: guided-set");
    expect(prompt).toContain("## Continuity Carryover Contract");
    expect(prompt).toContain("mini-eggo-robot-scout");
    expect(prompt).toContain("Previous images are attached only as evidence");
    expect(prompt).toContain("Do not carry over green-screen borders");
    expect(prompt).toContain("the root contract wins");
  });

  test("dry-run receipt lists continuity refs and carryovers", () => {
    const { manifest, image } = continuityFixture();
    const result = parseEggoSceneCli(argv({}, [
      "--continuity-manifest", manifest,
      "--carry-over", "mini-eggo-robot-scout",
    ]));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const continuity = resolveEggoContinuity(result.request);
    expect(continuity.ok).toBe(true);
    if (!continuity.ok) throw new Error("expected continuity success");
    const placement = buildPlacementPlan(result.request, "pop-western");
    const prompt = buildEggoScenePrompt({
      config: { styleName: "Pop Western", stylePrompt: "bold flat western cartoon pop action" },
      selectedStyle: "Pop Western",
      inputImages: ["eggo-ref.png", ...continuity.continuity.imagePaths],
      referenceImages: ["eggo-ref.png"],
      request: result.request,
      placement,
      continuity: continuity.continuity,
    });
    const receipt = formatDryRunReceipt({
      config: { name: "imp-eggo-pop-western", styleName: "Pop Western" },
      selectedStyle: "Pop Western",
      request: result.request,
      placement,
      expandedPrompt: prompt,
      inputImages: ["eggo-ref.png", ...continuity.continuity.imagePaths],
      continuity: continuity.continuity,
    });
    expect(receipt).toContain("continuity mode: guided-set");
    expect(receipt).toContain("selected carryover ids:");
    expect(receipt).toContain("- mini-eggo-robot-scout from intro-panel");
    expect(receipt).toContain("attached continuity image paths:");
    expect(receipt).toContain(image);
  });
});
