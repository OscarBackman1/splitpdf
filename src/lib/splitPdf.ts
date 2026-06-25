import { PDFDocument } from "pdf-lib";
import {
  applyAdjustments,
  fullPageTemplate,
  orderBoxes,
  powerpointHandoutTemplate,
  validateBox,
} from "./cropDetection";
import { parsePageRange } from "./pageRange";
import type { CropTemplate, Margins, SplitProgress, SplitSettings } from "./types";
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

const DEFAULT_SLIDE_RATIO = 16 / 9;
const NO_MARGINS: Margins = { top: 0, right: 0, bottom: 0, left: 0 };

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
    const keepFirstPagesUnsplit = coerceNonNegativeInteger(settings.keepFirstPagesUnsplit);

    for (const [index, pageIndex] of selectedPages.entries()) {
      if (signal?.aborted) {
        throw new DOMException("Split canceled.", "AbortError");
      }

      const sourcePage = source.getPage(pageIndex);
      const { width, height } = sourcePage.getSize();

      if (pageIndex < keepFirstPagesUnsplit) {
        const [copied] = await output.copyPages(source, [pageIndex]);
        output.addPage(copied);
      } else {
        const template = computeTemplate({ width, height }, settings);
        const boxes =
          settings.cropMode === "single-slide-page"
            ? [template.first]
            : orderBoxes(template, settings.order);

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
  const base = baseTemplate(page, settings);

  const gutter = settings.cropMode === "single-slide-page" ? 0 : settings.gutter;
  return applyAdjustments(base, page, settings.layout, gutter, NO_MARGINS);
}

function baseTemplate(page: { width: number; height: number }, settings: SplitSettings) {
  if (settings.cropMode === "single-slide-page") {
    return settings.detectedCropTemplate ?? fullPageTemplate(page);
  }

  return (
    settings.detectedCropTemplate ??
    powerpointHandoutTemplate(page, settings.layout, DEFAULT_SLIDE_RATIO)
  );
}

function coerceNonNegativeInteger(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
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
