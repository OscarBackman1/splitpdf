import * as pdfjsLib from "pdfjs-dist";
import { detectTemplateFromImageData } from "../lib/cropDetection";
import { parsePageRange } from "../lib/pageRange";
import { splitTwoUpPdf } from "../lib/splitPdf";
import type { CropTemplate, PageSize, SplitSettings } from "../lib/types";

type WorkerRequest =
  | { type: "split"; input: ArrayBuffer; settings: SplitSettings }
  | { type: "cancel" };

interface WorkerContext {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
}

const workerScope = self as unknown as WorkerContext;
let canceled = false;

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type === "cancel") {
    canceled = true;
    return;
  }

  canceled = false;
  try {
    const settings =
      event.data.settings.cropMode === "per-page-2up-auto"
        ? await withPerPageDetection(event.data.input, event.data.settings)
        : event.data.settings;
    const output = await splitTwoUpPdf(event.data.input, settings, (progress) => {
      workerScope.postMessage({ type: "progress", progress });
      if (canceled) {
        throw new DOMException("Split canceled.", "AbortError");
      }
    });
    workerScope.postMessage({ type: "success", output });
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? "Split canceled."
        : error instanceof Error
          ? error.message
          : "The PDF could not be split.";
    workerScope.postMessage({ type: "error", message });
  }
};

async function withPerPageDetection(
  input: ArrayBuffer,
  settings: SplitSettings,
): Promise<SplitSettings> {
  const documentParams = {
    data: new Uint8Array(input.slice(0)),
    disableWorker: true,
  } as unknown as Parameters<typeof pdfjsLib.getDocument>[0];
  const loadingTask = pdfjsLib.getDocument(documentParams);
  const pdf = await loadingTask.promise;
  const selectedPages = parsePageRange(settings.pageSelection, pdf.numPages);
  const templates: Record<number, CropTemplate> = {};

  try {
    for (const pageIndex of selectedPages) {
      if (canceled) {
        throw new DOMException("Split canceled.", "AbortError");
      }

      const page = await pdf.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 1.35 });
      const canvas = new OffscreenCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        throw new Error("This browser could not render pages for per-page detection.");
      }

      await page.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;

      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const pageSize: PageSize = {
        width: page.view[2] - page.view[0],
        height: page.view[3] - page.view[1],
      };
      templates[pageIndex] = detectTemplateFromImageData(
        image,
        canvas,
        pageSize,
        settings.layout,
        settings.slideAspectRatio,
        settings.customAspectRatio,
      ).template;
    }
  } finally {
    await loadingTask.destroy();
  }

  return { ...settings, perPageCropTemplates: templates };
}
