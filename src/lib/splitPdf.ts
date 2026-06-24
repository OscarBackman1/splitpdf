import { PDFDocument } from "pdf-lib";
import {
  applyAdjustments,
  aspectRatioValue,
  orderBoxes,
  powerpointHandoutTemplate,
  presetTemplate,
  simpleHalfTemplate,
  validateBox,
} from "./cropDetection";
import { parsePageRange } from "./pageRange";
import type { CropTemplate, SplitProgress, SplitSettings } from "./types";
export type {
  CropMode,
  CropTemplate,
  ManualCropBox,
  Margins,
  SlideAspectRatio,
  SplitLayout,
  SplitOrder,
  SplitProgress,
  SplitSettings,
} from "./types";

export async function splitTwoUpPdf(
  input: ArrayBuffer,
  settings: SplitSettings,
  onProgress?: (progress: SplitProgress) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  try {
    const source = await PDFDocument.load(input, { ignoreEncryption: false });
    const output = await PDFDocument.create();
    const selectedPages = parsePageRange(settings.pageSelection, source.getPageCount());
    const totalPages = selectedPages.length;

    for (const [index, pageIndex] of selectedPages.entries()) {
      if (signal?.aborted) {
        throw new DOMException("Split canceled.", "AbortError");
      }

      const sourcePage = source.getPage(pageIndex);
      const { width, height } = sourcePage.getSize();

      if (settings.keepFirstPageUnsplit && pageIndex === 0) {
        const [copied] = await output.copyPages(source, [pageIndex]);
        output.addPage(copied);
      } else {
        const template = computeTemplate({ width, height }, settings);
        const boxes = orderBoxes(template, settings.order);

        for (const box of boxes) {
          validateBox(box);
          const embedded = await output.embedPage(sourcePage, box);
          const page = output.addPage([box.right - box.left, box.top - box.bottom]);
          page.drawPage(embedded, {
            x: 0,
            y: 0,
            width: box.right - box.left,
            height: box.top - box.bottom,
          });
        }
      }

      onProgress?.({ currentPage: index + 1, totalPages });
    }

    return output.save();
  } catch (error) {
    throw normalizePdfError(error);
  }
}

export function computeTemplate(
  page: { width: number; height: number },
  settings: SplitSettings,
): CropTemplate {
  const base =
    (settings.cropMode === "manual" || settings.cropMode === "auto-detect") &&
    settings.manualCropTemplate
      ? settings.manualCropTemplate
      : settings.cropMode === "simple-half-split"
        ? simpleHalfTemplate(page, settings.layout)
        : settings.cropMode === "powerpoint-2up-preset"
          ? settings.detectedCropTemplate ??
            powerpointHandoutTemplate(
              page,
              settings.layout,
              aspectRatioValue(settings.slideAspectRatio, settings.customAspectRatio),
            )
        : presetTemplate(
            page,
            settings.layout,
            aspectRatioValue(settings.slideAspectRatio, settings.customAspectRatio),
          );

  return applyAdjustments(base, page, settings.layout, settings.gutter, settings.margins);
}

function normalizePdfError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return error;
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("encrypt")) {
      return new Error("This PDF appears to be encrypted or password-protected.");
    }
    if (message.includes("invalid") || message.includes("parse")) {
      return new Error("This file could not be parsed as a valid PDF.");
    }
    return error;
  }
  return new Error("The PDF could not be split.");
}
