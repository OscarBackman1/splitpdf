import { describe, expect, it } from "vitest";
import {
  applyAdjustments,
  normalizeFrameTemplateToLayout,
  powerpointHandoutTemplate,
  presetTemplate,
  simpleHalfTemplate,
} from "./cropDetection";

describe("crop templates", () => {
  it("builds a top-bottom half split in PDF coordinates", () => {
    expect(simpleHalfTemplate({ width: 600, height: 800 }, "top-bottom")).toEqual({
      first: { left: 0, bottom: 400, right: 600, top: 800 },
      second: { left: 0, bottom: 0, right: 600, top: 400 },
    });
  });

  it("fits 16:9 slides inside portrait halves", () => {
    const template = presetTemplate({ width: 612, height: 792 }, "top-bottom", 16 / 9);
    expect(template.first.left).toBeCloseTo(0);
    expect(template.first.right).toBeCloseTo(612);
    expect(template.first.top - template.first.bottom).toBeCloseTo(344.25);
  });

  it("estimates Microsoft PowerPoint 2-up handout slide boxes", () => {
    const template = powerpointHandoutTemplate({ width: 612, height: 792 }, "top-bottom", 16 / 9);
    expect(template.first.left).toBeCloseTo(66);
    expect(template.first.right).toBeCloseTo(546);
    expect(template.first.top - template.first.bottom).toBeCloseTo(270);
    expect(template.second.top - template.second.bottom).toBeCloseTo(270);
  });

  it("normalizes frame templates with a small outward safety margin", () => {
    const template = normalizeFrameTemplateToLayout(
      {
        first: { left: 64, bottom: 432, right: 548, top: 705 },
        second: { left: 66, bottom: 66, right: 546, top: 336 },
      },
      { width: 612, height: 792 },
      "top-bottom",
    );

    expect(template.first.left).toBeLessThan(64);
    expect(template.first.right).toBeGreaterThan(548);
    expect(template.first.top - template.first.bottom).toBeGreaterThan(273);
    expect(template.second.left).toBeLessThan(64);
    expect(template.second.right).toBeGreaterThan(548);
    expect(template.second.top - template.second.bottom).toBeGreaterThan(273);
  });

  it("applies extra margin and gutter adjustments", () => {
    const adjusted = applyAdjustments(
      {
        first: { left: 0, bottom: 400, right: 600, top: 800 },
        second: { left: 0, bottom: 0, right: 600, top: 400 },
      },
      { width: 600, height: 800 },
      "top-bottom",
      12,
      { top: 1, right: 2, bottom: 3, left: 4 },
    );
    expect(adjusted.first).toEqual({ left: 4, bottom: 415, right: 598, top: 799 });
    expect(adjusted.second).toEqual({ left: 4, bottom: 3, right: 598, top: 387 });
  });
});
