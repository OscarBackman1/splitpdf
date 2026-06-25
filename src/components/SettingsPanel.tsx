import { useState } from "react";
import type { DetectionResult, SplitOrder, SplitSettings } from "../lib/types";

interface SettingsPanelProps {
  settings: SplitSettings;
  detection: DetectionResult | null;
  pageRangeError: string | null;
  pageCount: number;
  canSplit: boolean;
  isSplitting: boolean;
  progressLabel: string;
  downloadUrl: string | null;
  outputName: string;
  onSettingsChange(settings: SplitSettings): void;
  onDetect(): void;
  onSplit(): void;
  onCancel(): void;
  onDownload(): void;
}

export function SettingsPanel({
  settings,
  detection,
  pageRangeError,
  pageCount,
  canSplit,
  isSplitting,
  progressLabel,
  downloadUrl,
  outputName,
  onSettingsChange,
  onDetect,
  onSplit,
  onCancel,
  onDownload,
}: SettingsPanelProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const patch = (next: Partial<SplitSettings>) => onSettingsChange({ ...settings, ...next });
  const isSingleSlideMode = settings.cropMode === "single-slide-page";
  const firstPagesOptions = Array.from({ length: Math.max(1, pageCount) }, (_, index) => index);

  return (
    <aside className="settings-panel">
      <div className="panel-header">
        <h2>Conversion</h2>
      </div>

      <Status detection={detection} isSplitting={isSplitting} downloadUrl={downloadUrl} />

      <div className="action-block">
        {isSplitting ? (
          <button className="main-button" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : downloadUrl ? (
          <>
            <a className="download-button" href={downloadUrl} download={outputName} onClick={onDownload}>
              Download split PDF
            </a>
            <button className="secondary-button" type="button" disabled={!canSplit} onClick={onSplit}>
              Split again
            </button>
          </>
        ) : (
          <button className="main-button" type="button" disabled={!canSplit} onClick={onSplit}>
            Split now
          </button>
        )}
        {progressLabel && <p>{progressLabel}</p>}
        {pageRangeError && <p className="field-error">{pageRangeError}</p>}
      </div>

      <details
        className="advanced-panel"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
      >
        <summary>Advanced</summary>
        <div className="advanced-grid">
          <button className="secondary-button" type="button" onClick={onDetect}>
            Re-detect slide boxes
          </button>

          <label>
            Crop mode
            <select
              value={settings.cropMode}
              onChange={(event) =>
                patch({
                  cropMode: event.target.value as SplitSettings["cropMode"],
                  detectedCropTemplate: undefined,
                  gutter: 0,
                })
              }
            >
              <option value="powerpoint-2up-preset">PowerPoint 2-slide handout</option>
              <option value="single-slide-page">One slide per page</option>
            </select>
          </label>

          {!isSingleSlideMode && (
            <>
              <div className="segmented">
                <span>Layout</span>
                <button
                  className={settings.layout === "top-bottom" ? "is-active" : ""}
                  type="button"
                  onClick={() => patch({ layout: "top-bottom", order: normalizeOrder("top-bottom") })}
                >
                  Top / bottom
                </button>
                <button
                  className={settings.layout === "left-right" ? "is-active" : ""}
                  type="button"
                  onClick={() => patch({ layout: "left-right", order: normalizeOrder("left-right") })}
                >
                  Left / right
                </button>
              </div>

              <label>
                Output order
                <select
                  value={settings.order}
                  onChange={(event) => patch({ order: event.target.value as SplitOrder })}
                >
                  {settings.layout === "top-bottom" ? (
                    <>
                      <option value="top-bottom">Top then bottom</option>
                      <option value="bottom-top">Bottom then top</option>
                    </>
                  ) : (
                    <>
                      <option value="left-right">Left then right</option>
                      <option value="right-left">Right then left</option>
                    </>
                  )}
                </select>
              </label>

              <div className="range-field">
                <label htmlFor="gutter">Gutter removal</label>
                <div>
                  <input
                    id="gutter"
                    type="range"
                    min="0"
                    max="80"
                    value={settings.gutter}
                    onChange={(event) => patch({ gutter: Number(event.target.value) })}
                  />
                  <input
                    type="number"
                    min="0"
                    value={settings.gutter}
                    onChange={(event) => patch({ gutter: Number(event.target.value) })}
                  />
                </div>
              </div>
            </>
          )}

          <label>
            Keep first pages unsplit
            <select
              value={settings.keepFirstPagesUnsplit}
              onChange={(event) =>
                patch({
                  keepFirstPagesUnsplit: Number(event.target.value),
                  detectedCropTemplate: undefined,
                })
              }
            >
              {firstPagesOptions.map((count) => (
                <option key={count} value={count}>
                  {count === 0 ? "None" : `${count} ${count === 1 ? "page" : "pages"}`}
                </option>
              ))}
            </select>
          </label>

          <label>
            Page range
            <input
              type="text"
              value={settings.pageSelection}
              onChange={(event) => patch({ pageSelection: event.target.value })}
              aria-invalid={Boolean(pageRangeError)}
            />
          </label>

          <label>
            Output file name
            <input
              type="text"
              value={settings.outputName ?? ""}
              onChange={(event) => patch({ outputName: event.target.value })}
            />
          </label>
        </div>
      </details>
    </aside>
  );
}

function Status({
  detection,
  isSplitting,
  downloadUrl,
}: {
  detection: DetectionResult | null;
  isSplitting: boolean;
  downloadUrl: string | null;
}) {
  if (downloadUrl) {
    return <div className="status">Split complete</div>;
  }

  if (isSplitting) {
    return <div className="status">Splitting PDF locally in your browser</div>;
  }

  return (
    <div className={`status ${detection?.confidence === "low" ? "status-warning" : ""}`}>
      {detection?.message ?? "Drop a PDF and the splitter will detect the slide boxes"}
    </div>
  );
}

function normalizeOrder(layout: SplitSettings["layout"]): SplitOrder {
  return layout === "top-bottom" ? "top-bottom" : "left-right";
}
