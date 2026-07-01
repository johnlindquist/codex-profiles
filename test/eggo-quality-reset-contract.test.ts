import { describe, expect, test } from "bun:test";
import {
  buildEggoResetPrompt,
  buildVisualCausalityContract,
  eggoAgentRobotsDesign,
  eggoEditorialMetaphorDesign,
  eggoReferenceSheetDesign,
  eggoResetDesigns,
  eggoWorkflowDiagramDesign,
  formatEggoResetDryRunReceipt,
  formatEggoResetFlagFailure,
  parseEggoResetCli,
} from "../imps/imp-eggo-quality-reset.assets/contract.ts";

const baseArgs = [
  "--section-title", "Make The Repo Agent-Ready",
  "--section-claim", "Agents work better when a repo exposes clear entrypoints, fast checks, and safe task boundaries.",
  "--audience-context", "developers preparing a software project for Codex and imp workflows",
  "--metaphor-focus", "turn a confusing repo into a prepared environment where coding agents can safely understand, verify, and act",
  "--must-include", "repo entrypoint map,fast verification check,isolated task lane,agent handoff point,mini-eggo robot agents",
  "--must-avoid", "label-only decoration,generic app screen,abstract software wallpaper,mascot poster",
  "--visible-consequence", "a confused agent path becomes a safe repeatable route through docs tests tool gates and boundaries",
  "--output-intent", "one opaque comparison image for visual direction selection",
  "--asset-slug", "make-repo-agent-ready",
];

function parse(extra: string[] = []) {
  return parseEggoResetCli([...baseArgs, ...extra]);
}

describe("Eggo quality reset contract", () => {
  test("missing flags fail before generation with a copyable reset template", () => {
    const result = parseEggoResetCli([]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected parse failure");
    const message = formatEggoResetFlagFailure(result, "imp-eggo-editorial-metaphor");
    expect(message).toContain("No image generation was attempted.");
    expect(message).toContain("Required reset flag contract:");
    expect(message).toContain("--section-title <text>");
    expect(message).toContain("Copyable template:");
  });

  test("positional prompts are rejected", () => {
    const result = parseEggoResetCli(["draw a cute repo robot", ...baseArgs]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected parse failure");
    expect(result.positionals).toEqual(["draw a cute repo robot"]);
    expect(result.messages.join("\n")).toContain("Unexpected positional prompt");
  });

  test("transparent background and invalid quality are rejected", () => {
    const transparent = parse(["--background", "transparent"]);
    expect(transparent.ok).toBe(false);
    if (transparent.ok) throw new Error("expected transparent failure");
    expect(transparent.invalid.map((item) => item.flag)).toContain("--background");

    const quality = parse(["--quality", "best"]);
    expect(quality.ok).toBe(false);
    if (quality.ok) throw new Error("expected quality failure");
    expect(quality.invalid.map((item) => item.flag)).toContain("--quality");
  });

  test("invalid gpt-image-2 size is rejected", () => {
    const result = parse(["--size", "1000x1000"]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected size failure");
    expect(result.invalid.map((item) => item.flag)).toContain("--size");
  });

  test("must include mini-eggo robot agents", () => {
    const result = parseEggoResetCli([
      ...baseArgs.slice(0, baseArgs.indexOf("--must-include") + 1),
      "repo entrypoint map,fast verification check,isolated task lane",
      ...baseArgs.slice(baseArgs.indexOf("--must-avoid")),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected robot failure");
    expect(result.invalid.map((item) => item.flag)).toContain("--must-include");
  });

  test("all designs produce prompts with Eggo and robot invariants", () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");

    for (const design of eggoResetDesigns) {
      const prompt = buildEggoResetPrompt(design, result.request, ["eggo-ref.png"]);
      expect(prompt).toContain("off-white egg character");
      expect(prompt).toContain("thick black glasses");
      expect(prompt).toContain("three fingers plus thumb");
      expect(prompt).toContain("small egg head");
      expect(prompt).toContain("wheeled or treaded");
      expect(prompt).toContain("antenna or sensor");
      expect(prompt).toContain("chassis-mounted tool module");
      expect(prompt).toContain("no visible pupils or eyeballs");
      expect(prompt).toContain("no humanoid arms");
      expect(prompt).toContain("no hands, no fingers");
      expect(prompt).toContain("do not render as photorealistic 3D");
      expect(prompt).toContain("Do not use green checkmarks");
      expect(prompt).toContain("proof is only a checkmark/status icon");
    }
  });

  test("all designs include a visual causality contract and label-only rejection", () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");

    for (const design of [eggoEditorialMetaphorDesign, eggoWorkflowDiagramDesign, eggoAgentRobotsDesign]) {
      const prompt = buildEggoResetPrompt(design, result.request, []);
      expect(prompt).toContain("Visual Causality Contract:");
      expect(prompt).toContain("A label may clarify a real prop, but it may not be the only evidence.");
      expect(prompt).toContain("forbidden fake substitute");
      expect(prompt.toLowerCase()).not.toContain("pop-western");
      expect(prompt.toLowerCase()).not.toContain("candy-colored");
    }
  });

  test("reference sheet design produces reusable metaphor vocabulary instead of a poster scene", () => {
    const result = parse([
      "--must-include",
      "agentic environment maintenance bay,script cartridge or command adapter,context bundle map manifest packet,verification gate gauge jig,sandboxed task lane safe work cell,handoff dock tool port,mini-eggo robot agents",
      "--asset-slug",
      "eggo-metaphor-reference-sheet",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const prompt = buildEggoResetPrompt(eggoReferenceSheetDesign, result.request, ["eggo-ref.png"]);
    expect(prompt).toContain("reusable visual metaphor reference sheet");
    expect(prompt).toContain("Build a reusable visual vocabulary sheet");
    expect(prompt).toContain("agentic environment as a prepared maintenance bay");
    expect(prompt).toContain("scripts as socketed command cartridges");
    expect(prompt).toContain("context as folder bundles");
    expect(prompt).toContain("verification as gauges");
    expect(prompt).toContain("handoff as a dock");
    expect(prompt).toContain("prepared maintenance bay with safe lanes");
    expect(prompt).toContain("folder bundle, map packet, manifest card");
    expect(prompt).toContain("handoff dock, tool port, transfer socket");
    expect(prompt).toContain("only concise specimen labels");
    expect(prompt).toContain("Image 1: reference only");
    expect(prompt).not.toContain("one central metaphor, not a mascot poster");
  });

  test("visual causality rows map required primitives to props and actions", () => {
    const result = parse();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const rows = buildVisualCausalityContract(result.request);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows[0]?.prop).toContain("repo map");
    expect(rows.some((row) => row.prop.includes("mini-eggo robot"))).toBe(true);
    expect(rows.every((row) => row.forbiddenFake.includes("sign"))).toBe(true);
  });

  test("old contaminated style anchors are rejected", () => {
    const result = parse(["--must-avoid", "pop-western style"]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected contaminated anchor failure");
    expect(result.messages.join("\n")).toContain("Old contaminated style anchor");
  });

  test("dry-run receipt lists reference role map", () => {
    const result = parse(["--dry-run"]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected parse success");
    const prompt = buildEggoResetPrompt(eggoWorkflowDiagramDesign, result.request, ["eggo-ref.png"]);
    const receipt = formatEggoResetDryRunReceipt(eggoWorkflowDiagramDesign, result.request, prompt, ["eggo-ref.png"]);
    expect(receipt).toContain("Reference role map:");
    expect(receipt).toContain("Image 1");
    expect(receipt).toContain("Visual Causality Contract:");
  });
});
