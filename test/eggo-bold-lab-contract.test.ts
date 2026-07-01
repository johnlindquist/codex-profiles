import { describe, expect, test } from "bun:test";
import {
  buildEggoBoldLabPrompt,
  formatEggoBoldLabDryRunReceipt,
  formatEggoBoldLabFlagFailure,
  parseEggoBoldLabCli,
} from "../imps/imp-eggo-bold-lab.assets/contract.ts";

const baseArgs = [
  "--asset-kind", "section-scene",
  "--section-title", "Make The Repo Agent-Ready",
  "--section-claim", "Agents work better when a repo exposes clear entrypoints, fast checks, and safe task boundaries.",
  "--audience-context", "developers preparing a software project for Codex and imp workflows",
  "--scene-action", "main Eggo joyfully pilots mini-eggo robot proxies through a simple lab-machine repo workflow",
  "--main-eggo-emotion", "celebrating",
  "--robot-proxy-count", "3",
  "--robot-control-link", "wireless-signal",
  "--must-include", "repo entrypoint machine,verification gate,safe task lane,mini-eggo robot proxies,main Eggo controller",
  "--visible-consequence", "confusing repo clutter becomes a bright safe route that the robot proxies can follow",
  "--must-avoid", "isometric,2.5D,thin technical illustration,opaque background,dense UI,muted editorial sketch,label-only meaning,photorealistic render",
  "--asset-slug", "make-repo-agent-ready-bold-lab",
];

function parse(extra: string[] = []) {
  return parseEggoBoldLabCli([...baseArgs, ...extra]);
}

describe("Eggo bold-lab contract", () => {
  test("missing flags fail before generation with a copyable bold-lab template", () => {
    const result = parseEggoBoldLabCli([]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected parse failure");
    const message = formatEggoBoldLabFlagFailure(result, "imp-eggo-bold-lab");
    expect(message).toContain("No image generation was attempted.");
    expect(message).toContain("Required bold-lab flag contract:");
    expect(message).toContain("--asset-kind <reference-sheet|section-scene>");
    expect(message).toContain("Copyable section-scene template:");
  });

  test("positional prompts are rejected", () => {
    const result = parseEggoBoldLabCli(["draw a cute repo robot", ...baseArgs]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected parse failure");
    expect(result.positionals).toEqual(["draw a cute repo robot"]);
    expect(result.messages.join("\n")).toContain("Unexpected positional prompt");
  });

  test("invalid enums and robot count are rejected", () => {
    const invalidAsset = parse(["--asset-kind", "poster"]);
    expect(invalidAsset.ok).toBe(false);
    if (invalidAsset.ok) throw new Error("expected asset failure");
    expect(invalidAsset.invalid.map((item) => item.flag)).toContain("--asset-kind");

    const invalidEmotion = parse(["--main-eggo-emotion", "neutral"]);
    expect(invalidEmotion.ok).toBe(false);
    if (invalidEmotion.ok) throw new Error("expected emotion failure");
    expect(invalidEmotion.invalid.map((item) => item.flag)).toContain("--main-eggo-emotion");

    const invalidLink = parse(["--robot-control-link", "cable-harness"]);
    expect(invalidLink.ok).toBe(false);
    if (invalidLink.ok) throw new Error("expected link failure");
    expect(invalidLink.invalid.map((item) => item.flag)).toContain("--robot-control-link");

    for (const count of ["1", "6", "3.5"]) {
      const result = parse(["--robot-proxy-count", count]);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected count failure");
      expect(result.invalid.map((item) => item.flag)).toContain("--robot-proxy-count");
    }
  });

  test("reaction emotion taxonomy accepts non-positive slide emotions", () => {
    for (const emotion of ["skeptical", "overwhelmed", "exhausted"]) {
      const result = parse(["--main-eggo-emotion", emotion]);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`expected ${emotion} to parse`);
      expect(result.request.mainEggoEmotion).toBe(emotion);
    }
  });

  test("requires green-screen key and mini-eggo robot proxy primitive", () => {
    const wrongKey = parse(["--background-key", "#ffffff"]);
    expect(wrongKey.ok).toBe(false);
    if (wrongKey.ok) throw new Error("expected key failure");
    expect(wrongKey.invalid.map((item) => item.flag)).toContain("--background-key");

    const missingRobot = parseEggoBoldLabCli([
      ...baseArgs.slice(0, baseArgs.indexOf("--must-include") + 1),
      "repo entrypoint machine,verification gate,safe task lane,main Eggo controller",
      ...baseArgs.slice(baseArgs.indexOf("--visible-consequence")),
    ]);
    expect(missingRobot.ok).toBe(false);
    if (missingRobot.ok) throw new Error("expected robot primitive failure");
    expect(missingRobot.invalid.map((item) => item.flag)).toContain("--must-include");
  });

  test("bad style anchors are allowed in must-avoid but rejected in scene-action", () => {
    const allowed = parse();
    expect(allowed.ok).toBe(true);

    const rejected = parse(["--scene-action", "isometric photorealistic dashboard of mini-eggo robot proxies"]);
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error("expected bad action failure");
    expect(rejected.messages.join("\n")).toContain("Rejected scene-action style anchor: isometric");
    expect(rejected.messages.join("\n")).toContain("Photorealistic styling is not allowed");
  });

  test("section-scene prompt restores green-screen chroma-key workflow", () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const prompt = buildEggoBoldLabPrompt(result.request, ["style.png", "eggo.png"]);

    expect(prompt).toContain("transparent green-screen source, then chroma-keyed transparent PNG");
    expect(prompt).toContain("Generate a source image on a perfectly flat solid #00ff00 green-screen background.");
    expect(prompt).toContain("Opaque-background output is invalid.");
    expect(prompt).toContain("continuous empty flat #00ff00 moat");
    expect(prompt).toContain("The entire outer background is exactly uniform #00ff00");
    expect(prompt).toContain("No black outline, prop, sparkle, arrow, path, robot, or Eggo body part may enter the outer 15% border.");
    expect(prompt).toContain("final transparent PNG");
  });

  test("prompt makes Image 1 the style authority without naming a style", () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const prompt = buildEggoBoldLabPrompt(result.request, []);

    expect(prompt).toContain("Style inference contract:");
    expect(prompt).toContain("Image 1 is the visual style authority.");
    expect(prompt).toContain("use them as pose, hand, eyebrow, and expression-mark vocabulary references");
    expect(prompt).toContain("Infer the drawing style, line quality, shape language, color behavior, composition energy, and level of simplicity from Image 1.");
    expect(prompt).toContain("Do not name or blend in any other style source.");
    expect(prompt).toContain("Do not make the image look like a polished render");
    expect(prompt).toContain("3D toy render");
    expect(prompt).toContain("soft-material render");
    expect(prompt).toContain("Keep forms flat and cartoon-readable");
    expect(prompt).toContain("bold 2D sticker cluster");
    expect(prompt).toContain("no rendered material texture");
    expect(prompt).toContain("Use the requested pose, position, and camera angle when provided");
    expect(prompt).toContain("low angle, slight overhead, over-shoulder, side-view, close-up, or three-quarter cartoon staging");
    expect(prompt).toContain("bold sticker-like cluster rather than an isometric scene");
    expect(prompt).toContain("Keep the entire subject inside the center 70% of the canvas");
    expect(prompt).toContain("center 70% of the canvas");
    expect(prompt).toContain("15% empty green-screen border");
    expect(prompt).not.toContain("thick black marker outlines");
    expect(prompt).not.toContain("jagged starbursts");
    expect(prompt).not.toContain("Do not make isometric");
  });

  test("prompt makes main Eggo joyful human/controller with strict anatomy", () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const prompt = buildEggoBoldLabPrompt(result.request, []);

    expect(prompt).toContain("Main Eggo represents the human/controller following along.");
    expect(prompt).toContain("Main Eggo is celebrating, emotionally specific, and in control");
    expect(prompt).toContain("Do not default to a raised fist");
    expect(prompt).toContain("pointing finger, open palm, both hands on glasses");
    expect(prompt).toContain("Eyebrows must vary with the emotion");
    expect(prompt).toContain("one skeptical arched brow");
    expect(prompt).toContain("Expression decorations must vary with the emotion and action");
    expect(prompt).toContain("Do not use the same orange exclamation burst on every image");
    expect(prompt).toContain("Use at most one closed fist across an entire batch");
    expect(prompt).toContain("Main Eggo always keeps complete black glasses visible");
    expect(prompt).toContain("the glasses may tilt, slide, reflect, or be touched by hands");
    expect(prompt).toContain("no eyes, no pupils, no mouth, no nose, no legs, no feet, no shoes, no footwear, no arms, no forearms, no elbows, no wrists, no sleeves");
    expect(prompt).toContain("no crossed-arm bands");
    expect(prompt).toContain("Hands are floating white mittens");
    expect(prompt).toContain("Hand plausibility: Eggo has no visible arms");
    expect(prompt).toContain("Eggo-left appears on viewer-right and Eggo-right appears on viewer-left");
    expect(prompt).toContain("complementary left/right pair");
    expect(prompt).toContain("not two left hands, two right hands");
    expect(prompt).toContain("short, reference-like reach");
  });

  test("prompt rejects visible arms and shell texture before chroma-keying", () => {
    const result = parse([
      "--scene-action", "main Eggo folds floating hands near a result card while two mini-eggo robot proxies wait",
      "--main-eggo-emotion", "concerned",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const prompt = buildEggoBoldLabPrompt(result.request, []);

    expect(prompt).toContain("no arms, no forearms, no elbows, no wrists, no sleeves, no crossed-arm bands");
    expect(prompt).toContain("no limb connector lines");
    expect(prompt).toContain("smooth flat off-white cartoon fill");
    expect(prompt).toContain("only one or two broad soft shadow shapes");
    expect(prompt).toContain("clean vector/cartoon color");
    expect(prompt).toContain("Do not add egg-shell texture");
    expect(prompt).toContain("paper grain");
    expect(prompt).toContain("pencil hatching");
    expect(prompt).toContain("contour hatch lines");
    expect(prompt).toContain("scratchy oval strokes");
    expect(prompt).toContain("visible arms, forearms, elbows, wrists, sleeves, crossed-arm bands");
    expect(prompt).toContain("white arm tubes");
    expect(prompt).toContain("shoes, footwear, boots, sneakers, sandals");
    expect(prompt).toContain("if shoes, footwear, boots, sneakers, sandals");
    expect(prompt).toContain("Treat mild style polish and close-but-not-exact green background as audit warnings");
    expect(prompt).toContain("anatomy, footwear, texture");
    expect(prompt).toContain("egg-shell texture, paper grain, pencil hatching");
    expect(prompt).toContain("if any visible arm, forearm, elbow, wrist, sleeve, crossed-arm band");
    expect(prompt).toContain("if Main Eggo's egg body has egg-shell texture, paper grain, pencil hatching");
    expect(prompt).toContain("if foreground green/key-adjacent marks appear on subject matter");
  });

  test("prompt rejects impossible same-handed Eggo mittens", () => {
    const result = parse([
      "--scene-action", "main Eggo rests one hand on the shell while the other hand hovers over a remote console",
      "--main-eggo-emotion", "relieved",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const prompt = buildEggoBoldLabPrompt(result.request, []);

    expect(prompt).toContain("two left hands, two right hands");
    expect(prompt).toContain("duplicated mitten silhouettes");
    expect(prompt).toContain("impossible palm-side duplicates");
    expect(prompt).toContain("broken wrist flips");
    expect(prompt).toContain("overextended floating hands");
    expect(prompt).toContain("visible hands do not form a plausible left/right pair");
  });

  test("prompt carries the requested reaction emotion into the visual contract", () => {
    const result = parse([
      "--main-eggo-emotion", "skeptical",
      "--scene-action", "main Eggo tilts sideways with folded arms while two mini-eggo robot proxies present a wobbly result card",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const prompt = buildEggoBoldLabPrompt(result.request, []);

    expect(prompt).toContain("Main Eggo is skeptical, emotionally specific, and in control");
    expect(prompt).toContain("one skeptical arched brow");
    expect(prompt).toContain("alarmed high-stress brows");
    expect(prompt).toContain("exhausted drooping brows");
    expect(prompt).toContain("embarrassed tucked brows");
  });

  test("prompt makes mini-eggo agents read as small Eggos with wireless robot accessories", () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const prompt = buildEggoBoldLabPrompt(result.request, []);

    expect(prompt).toContain("They must read as smaller Eggos first, with small robot accessories second");
    expect(prompt).toContain("about one-quarter the height of Main Eggo");
    expect(prompt).toContain("never more than one-third of Main Eggo height");
    expect(prompt).toContain("mostly visible white egg body");
    expect(prompt).toContain("black robot goggles or visor");
    expect(prompt).toContain("tiny wheeled/treaded base");
    expect(prompt).toContain("one or two small mech arms");
    expect(prompt).toContain("antenna or sensor light");
    expect(prompt).toContain("controlled wirelessly by main Eggo");
    expect(prompt).toContain("no cords, cables, tethers, hoses, leashes, or physical links");
    expect(prompt).toContain("must not have human arms, soft mitten hands, fingers, legs, feet");
  });

  test("reference-sheet mode produces reusable vocabulary specimens", () => {
    const result = parse(["--asset-kind", "reference-sheet"]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const prompt = buildEggoBoldLabPrompt(result.request, []);

    expect(prompt).toContain("transparent reusable Eggo bold-lab vocabulary sheet");
    expect(prompt).toContain("Reference sheet specimens:");
    expect(prompt).toContain("mini-eggo robot proxy front view");
    expect(prompt).toContain("mini-eggo robot proxy side view");
    expect(prompt).toContain("wireless command signal from main Eggo");
    expect(prompt).toContain("repo mechanism as one simple chunky lab machine");
  });

  test("dry-run receipt includes audit-relevant settings and references", () => {
    const result = parse(["--dry-run"]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const prompt = buildEggoBoldLabPrompt(result.request, ["style.png", "eggo.png"]);
    const receipt = formatEggoBoldLabDryRunReceipt(result.request, prompt, ["style.png", "eggo.png"]);

    expect(receipt).toContain("Eggo bold-lab dry run");
    expect(receipt).toContain("background_key: #00ff00");
    expect(receipt).toContain("robot_proxy_count: 3");
    expect(receipt).toContain("robot_control_link: wireless-signal");
    expect(receipt).toContain("Reference role map:");
    expect(receipt).toContain("Image 1");
  });
});
