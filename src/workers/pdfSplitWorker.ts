import { splitTwoUpPdf } from "../lib/splitPdf";
import type { SplitSettings } from "../lib/types";

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
    const output = await splitTwoUpPdf(event.data.input, event.data.settings, (progress) => {
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
