import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PdfPreview } from "./components/PdfPreview";
import { SettingsPanel } from "./components/SettingsPanel";
import { UploadDropzone } from "./components/UploadDropzone";
import { ensurePdfExtension, defaultOutputName } from "./lib/fileNames";
import { parsePageRange, PageRangeError } from "./lib/pageRange";
import { pdfjsLib } from "./lib/pdfjs";
import { computeTemplate } from "./lib/splitPdf";
import { defaultSettings } from "./lib/types";
import type { CropTemplate, DetectionResult, PageSize, SplitProgress, SplitSettings } from "./lib/types";

const MAX_FILE_BYTES = 200 * 1024 * 1024;

type WorkerMessage =
  | { type: "progress"; progress: SplitProgress }
  | { type: "success"; output: Uint8Array }
  | { type: "error"; message: string };

export function App() {
  const [fileName, setFileName] = useState("");
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [settings, setSettings] = useState<SplitSettings>(defaultSettings);
  const [pageSize, setPageSize] = useState<PageSize | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [detectionRequest, setDetectionRequest] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SplitProgress | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isSplitting, setIsSplitting] = useState(false);
  const [autoSplitQueued, setAutoSplitQueued] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      workerRef.current?.terminate();
    };
  }, [downloadUrl]);

  const pageRangeError = useMemo(() => {
    if (!fileBuffer || pageCount === 0) return null;
    try {
      parsePageRange(settings.pageSelection, pageCount);
      return null;
    } catch (rangeError) {
      return rangeError instanceof PageRangeError ? rangeError.message : "Invalid page range.";
    }
  }, [fileBuffer, pageCount, settings.pageSelection]);

  const outputName = ensurePdfExtension(settings.outputName || defaultOutputName(fileName || "split_slides.pdf"));

  const displayedTemplate = useMemo<CropTemplate | null>(() => {
    if (!pageSize) return null;
    return computeTemplate(pageSize, settings);
  }, [pageSize, settings]);

  const invalidateOutput = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setIsSplitting(false);
    setProgress(null);
    setDownloadUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setAutoSplitQueued(false);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setDetection(null);
    setPageCount(0);
    setPageSize(null);
    setProgress(null);
    setIsSplitting(false);
    setAutoSplitQueued(false);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    if (file.type && file.type !== "application/pdf") {
      setError("Choose a PDF file.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Choose a file with a .pdf extension.");
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setError("This PDF is very large. Try a file under 200 MB for the browser MVP.");
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: buffer.slice(0) });
      const pdf = await loadingTask.promise;
      setPageCount(pdf.numPages);
      setFileName(file.name);
      setFileBuffer(buffer);
      setSettings({ ...defaultSettings, outputName: defaultOutputName(file.name) });
    } catch (loadError) {
      const message =
        loadError instanceof Error && loadError.message.toLowerCase().includes("password")
          ? "This PDF appears to be encrypted or password-protected."
          : "This file could not be parsed as a valid PDF.";
      setError(message);
    }
  }, [downloadUrl]);

  const handlePreviewReady = useCallback((nextPageSize: PageSize) => {
    setPageSize(nextPageSize);
  }, []);

  const handleDetection = useCallback((result: DetectionResult, requestedByUser: boolean) => {
    setDetection(result);
    if (settings.cropMode === "single-slide-page") {
      invalidateOutput();
      setSettings((current) =>
        current.cropMode === settings.cropMode
          ? {
              ...current,
              detectedCropTemplate: result.template,
            }
          : current,
      );
      return;
    }

    if (requestedByUser) {
      invalidateOutput();
      setSettings((current) => ({
        ...current,
        cropMode: "auto-detect",
        manualCropTemplate: result.template,
      }));
      return;
    }

    setSettings((current) =>
      current.cropMode === "powerpoint-2up-preset"
        ? {
            ...current,
            detectedCropTemplate: result.template,
          }
        : current,
    );
  }, [invalidateOutput, settings.cropMode]);

  const handleTemplateChange = useCallback((template: CropTemplate) => {
    invalidateOutput();
    setSettings((current) => ({
      ...current,
      cropMode: "manual",
      manualCropTemplate: template,
    }));
  }, [invalidateOutput]);

  const splitPdf = useCallback(() => {
    if (!fileBuffer || pageRangeError) return;
    setError(null);
    setProgress({ currentPage: 0, totalPages: 0 });
    setIsSplitting(true);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    const worker = new Worker(new URL("./workers/pdfSplitWorker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.type === "progress") {
        setProgress(event.data.progress);
        return;
      }

      setIsSplitting(false);
      worker.terminate();
      workerRef.current = null;

      if (event.data.type === "error") {
        setError(event.data.message);
        return;
      }

      const blob = new Blob([event.data.output], { type: "application/pdf" });
      setDownloadUrl(URL.createObjectURL(blob));
    };

    worker.onerror = () => {
      setIsSplitting(false);
      setError("The worker failed while splitting the PDF.");
      worker.terminate();
      workerRef.current = null;
    };

    const workerInput = fileBuffer.slice(0);
    worker.postMessage({ type: "split", input: workerInput, settings }, [workerInput]);
  }, [downloadUrl, fileBuffer, pageRangeError, settings]);

  useEffect(() => {
    if (!fileBuffer || !pageSize || autoSplitQueued || isSplitting || downloadUrl || pageRangeError) {
      return;
    }

    const timer = window.setTimeout(() => {
      setAutoSplitQueued(true);
      splitPdf();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [autoSplitQueued, downloadUrl, fileBuffer, isSplitting, pageRangeError, pageSize, splitPdf]);

  const progressLabel = progress
    ? progress.totalPages > 0
      ? `Processing page ${progress.currentPage} of ${progress.totalPages}`
      : "Preparing PDF..."
    : "";

  return (
    <main>
      <UploadDropzone fileName={fileName} onFile={handleFile} />

      {error && <div className="app-error">{error}</div>}

      {fileBuffer && (
        <div className="workspace">
          <div className="preview-stack">
            <PdfPreview
              fileBuffer={fileBuffer}
              settings={settings}
              template={displayedTemplate}
              onPreviewReady={handlePreviewReady}
              onDetection={handleDetection}
              onTemplateChange={handleTemplateChange}
              detectionRequest={detectionRequest}
            />
            {downloadUrl && (
              <section className="result-preview">
                <h2>Split PDF preview</h2>
                <iframe title="Split PDF preview" src={downloadUrl} />
              </section>
            )}
          </div>
          <SettingsPanel
            settings={settings}
            detection={detection}
            pageRangeError={pageRangeError}
            canSplit={!isSplitting && !pageRangeError}
            isSplitting={isSplitting}
            progressLabel={progressLabel}
            downloadUrl={downloadUrl}
            outputName={outputName}
            onSettingsChange={(next) => {
              invalidateOutput();
              setSettings(next);
              setDetection((current) =>
                next.cropMode === "manual" ||
                next.cropMode === "auto-detect" ||
                next.cropMode === "single-slide-page"
                  ? current
                  : null,
              );
            }}
            onDetect={() => setDetectionRequest((count) => count + 1)}
            onSplit={splitPdf}
            onCancel={() => {
              workerRef.current?.postMessage({ type: "cancel" });
              workerRef.current?.terminate();
              workerRef.current = null;
              setIsSplitting(false);
              setProgress(null);
            }}
            onDownload={() => undefined}
          />
        </div>
      )}
    </main>
  );
}
