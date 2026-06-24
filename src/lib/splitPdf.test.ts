import { PDFDocument, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { computeTemplate, splitTwoUpPdf } from "./splitPdf";
import { defaultSettings } from "./types";

describe("splitTwoUpPdf", () => {
  it("keeps PowerPoint handout mode on a uniform slide-slot template", () => {
    const template = computeTemplate(
      { width: 612, height: 792 },
      {
        ...defaultSettings,
        cropMode: "powerpoint-2up-preset",
        manualCropTemplate: {
          first: { left: 80, bottom: 470, right: 420, top: 660 },
          second: { left: 90, bottom: 60, right: 560, top: 360 },
        },
      },
    );

    expect(template.first.left).toBeCloseTo(66);
    expect(template.first.right).toBeCloseTo(546);
    expect(template.first.top - template.first.bottom).toBeCloseTo(270);
    expect(template.second.right - template.second.left).toBeCloseTo(480);
    expect(template.second.top - template.second.bottom).toBeCloseTo(270);
  });

  it("uses a detected frame template in PowerPoint handout mode", () => {
    const template = computeTemplate(
      { width: 595.22, height: 842 },
      {
        ...defaultSettings,
        cropMode: "powerpoint-2up-preset",
        detectedCropTemplate: {
          first: { left: 41, bottom: 468, right: 548, top: 753 },
          second: { left: 41, bottom: 94, right: 548, top: 379 },
        },
      },
    );

    expect(template.first.left).toBeCloseTo(41);
    expect(template.first.right).toBeCloseTo(548);
    expect(template.first.top - template.first.bottom).toBeCloseTo(285);
    expect(template.second.left).toBeCloseTo(41);
    expect(template.second.right).toBeCloseTo(548);
  });

  it("preserves vector PDF content as cropped output pages", async () => {
    const source = await PDFDocument.create();
    const page = source.addPage([612, 792]);
    page.drawRectangle({
      x: 36,
      y: 430,
      width: 540,
      height: 303.75,
      borderColor: rgb(0, 0.45, 0.42),
      borderWidth: 2,
    });
    page.drawText("Top slide", { x: 64, y: 690, size: 24 });
    page.drawRectangle({
      x: 36,
      y: 58,
      width: 540,
      height: 303.75,
      borderColor: rgb(0.75, 0.2, 0.15),
      borderWidth: 2,
    });
    page.drawText("Bottom slide", { x: 64, y: 320, size: 24 });

    const input = await source.save();
    const output = await splitTwoUpPdf(input.buffer.slice(0), {
      ...defaultSettings,
      cropMode: "manual",
      manualCropTemplate: {
        first: { left: 36, bottom: 430, right: 576, top: 733.75 },
        second: { left: 36, bottom: 58, right: 576, top: 361.75 },
      },
    });

    const split = await PDFDocument.load(output);
    expect(split.getPageCount()).toBe(2);
    expect(split.getPage(0).getWidth()).toBeCloseTo(540);
    expect(split.getPage(0).getHeight()).toBeCloseTo(303.75);
  });

  it("uses detected crop templates outside manual mode", async () => {
    const source = await PDFDocument.create();
    const page = source.addPage([612, 792]);
    page.drawRectangle({
      x: 72,
      y: 440,
      width: 468,
      height: 263.25,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    page.drawRectangle({
      x: 72,
      y: 88,
      width: 468,
      height: 263.25,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    const input = await source.save();
    const output = await splitTwoUpPdf(input.buffer.slice(0), {
      ...defaultSettings,
      cropMode: "auto-detect",
      manualCropTemplate: {
        first: { left: 72, bottom: 440, right: 540, top: 703.25 },
        second: { left: 72, bottom: 88, right: 540, top: 351.25 },
      },
    });

    const split = await PDFDocument.load(output);
    expect(split.getPage(0).getWidth()).toBeCloseTo(468);
    expect(split.getPage(0).getHeight()).toBeCloseTo(263.25);
  });
});
