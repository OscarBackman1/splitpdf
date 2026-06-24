import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { aspectRatioValue, detectTemplateFromCanvas, slideFrameTemplate } from "../lib/cropDetection";
import { pdfjsLib } from "../lib/pdfjs";
import type { CropTemplate, DetectionResult, ManualCropBox, PageSize, SplitSettings } from "../lib/types";

interface PdfPreviewProps {
  fileBuffer: ArrayBuffer | null;
  settings: SplitSettings;
  template: CropTemplate | null;
  onPreviewReady(pageSize: PageSize, canvas: HTMLCanvasElement): void;
  onDetection(result: DetectionResult, requestedByUser: boolean): void;
  onTemplateChange(template: CropTemplate): void;
  detectionRequest: number;
}

type DragState = {
  box: "first" | "second";
  mode: "move" | "nw" | "ne" | "sw" | "se";
  startX: number;
  startY: number;
  startBox: ManualCropBox;
};

export function PdfPreview({
  fileBuffer,
  settings,
  template,
  onPreviewReady,
  onDetection,
  onTemplateChange,
  detectionRequest,
}: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const [pageSize, setPageSize] = useState<PageSize | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);

  useEffect(() => {
    let canceled = false;
    let renderTask: { cancel(): void; promise: Promise<unknown> } | null = null;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;

    async function render() {
      if (!fileBuffer || !canvasRef.current) return;
      setError(null);
      try {
        loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(fileBuffer.slice(0)),
        });
        const pdf = await loadingTask.promise;
        if (canceled) return;
        const page = await pdf.getPage(1);
        if (canceled) return;
        const viewport = page.getViewport({ scale: 1.45 });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
        if (canceled) return;
        const pdfPageSize = { width: page.view[2] - page.view[0], height: page.view[3] - page.view[1] };
        setPageSize(pdfPageSize);
        setRenderVersion((version) => version + 1);
        onPreviewReady(pdfPageSize, canvas);
      } catch (renderError) {
        const message =
          renderError instanceof Error && renderError.name === "RenderingCancelledException"
            ? null
            : renderError instanceof Error && renderError.message.toLowerCase().includes("password")
            ? "This PDF appears to be encrypted or password-protected."
            : "The first page could not be rendered. Check that this is a valid PDF.";
        if (!canceled && message) setError(message);
      }
    }

    render();
    return () => {
      canceled = true;
      renderTask?.cancel();
      void loadingTask?.destroy();
    };
  }, [fileBuffer, onPreviewReady]);

  useEffect(() => {
    if (!canvasRef.current || !pageSize || renderVersion === 0) return;
    if (settings.cropMode === "powerpoint-2up-preset") {
      const result = slideFrameTemplate(
        canvasRef.current,
        pageSize,
        settings.layout,
        aspectRatioValue(settings.slideAspectRatio, settings.customAspectRatio),
      );
      if (result) onDetection(result, false);
      return;
    }
    if (settings.cropMode !== "auto-detect") return;
    const result = detectTemplateFromCanvas(
      canvasRef.current,
      pageSize,
      settings.layout,
      settings.slideAspectRatio,
      settings.customAspectRatio,
    );
    onDetection(result, false);
  }, [
    onDetection,
    pageSize,
    renderVersion,
    settings.cropMode,
    settings.customAspectRatio,
    settings.layout,
    settings.slideAspectRatio,
  ]);

  useEffect(() => {
    if (!canvasRef.current || !pageSize || detectionRequest === 0) return;
    const result = detectTemplateFromCanvas(
      canvasRef.current,
      pageSize,
      settings.layout,
      settings.slideAspectRatio,
      settings.customAspectRatio,
    );
    onDetection(result, true);
  }, [
    detectionRequest,
    onDetection,
    pageSize,
    settings.customAspectRatio,
    settings.layout,
    settings.slideAspectRatio,
  ]);

  const boxes = useMemo(() => {
    if (!template || !pageSize) return [];
    return [
      { id: "first" as const, label: "Slide 1", box: template.first },
      { id: "second" as const, label: "Slide 2", box: template.second },
    ];
  }, [pageSize, template]);

  const isManual = settings.cropMode === "manual";

  return (
    <section className="preview-area">
      <div className="preview-main">
        <h2>Preview</h2>
        {error ? (
          <div className="preview-error">{error}</div>
        ) : (
          <div className="page-preview">
            <div className="canvas-stage">
              <canvas ref={canvasRef} />
              {pageSize && template && (
                <svg
                  ref={overlayRef}
                  className={`crop-overlay ${isManual ? "is-editable" : ""}`}
                  viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
                  preserveAspectRatio="none"
                  onPointerMove={(event) => {
                    if (!drag || !template || !isManual) return;
                    const point = svgPoint(event, overlayRef.current);
                    if (!point) return;
                    const dx = point.x - drag.startX;
                    const dy = point.y - drag.startY;
                    const nextBox = moveBox(drag.startBox, drag.mode, dx, dy, pageSize);
                    onTemplateChange({ ...template, [drag.box]: nextBox });
                  }}
                  onPointerUp={() => setDrag(null)}
                  onPointerCancel={() => setDrag(null)}
                >
                  {boxes.map(({ id, label, box }) => (
                    <g key={id}>
                      <rect
                        className={`crop-rect crop-${id}`}
                        x={box.left}
                        y={pageSize.height - box.top}
                        width={box.right - box.left}
                        height={box.top - box.bottom}
                        onPointerDown={(event) => {
                          if (!isManual) return;
                          const point = svgPoint(event, overlayRef.current);
                          if (!point) return;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setDrag({ box: id, mode: "move", startX: point.x, startY: point.y, startBox: box });
                        }}
                      />
                      <text x={box.left + 8} y={pageSize.height - box.top + 22}>
                        {label}
                      </text>
                      {isManual &&
                        (["nw", "ne", "sw", "se"] as const).map((handle) => (
                          <circle
                            key={handle}
                            className="crop-handle"
                            cx={handle.includes("w") ? box.left : box.right}
                            cy={handle.includes("n") ? pageSize.height - box.top : pageSize.height - box.bottom}
                            r="7"
                            onPointerDown={(event) => {
                              const point = svgPoint(event, overlayRef.current);
                              if (!point) return;
                              event.currentTarget.setPointerCapture(event.pointerId);
                              setDrag({ box: id, mode: handle, startX: point.x, startY: point.y, startBox: box });
                            }}
                          />
                        ))}
                    </g>
                  ))}
                </svg>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="thumb-grid">
        <h2>Output thumbnails</h2>
        {template && pageSize && canvasRef.current ? (
          <>
            <CropThumbnail
              source={canvasRef.current}
              pageSize={pageSize}
              box={template.first}
              label="Slide 1 preview"
              renderVersion={renderVersion}
            />
            <CropThumbnail
              source={canvasRef.current}
              pageSize={pageSize}
              box={template.second}
              label="Slide 2 preview"
              renderVersion={renderVersion}
            />
          </>
        ) : (
          <p className="empty-note">Upload a PDF to see extracted slide previews.</p>
        )}
      </div>
    </section>
  );
}

function CropThumbnail({
  source,
  pageSize,
  box,
  label,
  renderVersion,
}: {
  source: HTMLCanvasElement;
  pageSize: PageSize;
  box: ManualCropBox;
  label: string;
  renderVersion: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const sx = (box.left / pageSize.width) * source.width;
    const sy = ((pageSize.height - box.top) / pageSize.height) * source.height;
    const sw = ((box.right - box.left) / pageSize.width) * source.width;
    const sh = ((box.top - box.bottom) / pageSize.height) * source.height;
    const width = 320;
    const height = Math.max(1, Math.round((sh / sw) * width));
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
  }, [box, pageSize, renderVersion, source]);

  return (
    <figure className="thumb">
      <canvas ref={ref} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function svgPoint(event: ReactPointerEvent, svg: SVGSVGElement | null) {
  if (!svg) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  return point.matrixTransform(matrix.inverse());
}

function moveBox(
  box: ManualCropBox,
  mode: DragState["mode"],
  dx: number,
  dy: number,
  page: PageSize,
): ManualCropBox {
  const pdfDy = -dy;
  const minSize = 18;
  const next = { ...box };

  if (mode === "move") {
    const width = box.right - box.left;
    const height = box.top - box.bottom;
    next.left = clamp(box.left + dx, 0, page.width - width);
    next.right = next.left + width;
    next.bottom = clamp(box.bottom + pdfDy, 0, page.height - height);
    next.top = next.bottom + height;
    return next;
  }

  if (mode.includes("w")) next.left = clamp(box.left + dx, 0, box.right - minSize);
  if (mode.includes("e")) next.right = clamp(box.right + dx, box.left + minSize, page.width);
  if (mode.includes("n")) next.top = clamp(box.top + pdfDy, box.bottom + minSize, page.height);
  if (mode.includes("s")) next.bottom = clamp(box.bottom + pdfDy, 0, box.top - minSize);
  return next;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
