import { useState } from "react";
import type { DetectionResult, Margins, SplitOrder, SplitSettings } from "../lib/types";

interface SettingsPanelProps {
  settings: SplitSettings;
  detection: DetectionResult | null;
  pageRangeError: string | null;
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
  const patchMargins = (next: Partial<Margins>) =>
    patch({ margins: { ...settings.margins, ...next } });
  const isSingleSlideMode = settings.cropMode === "single-slide-page";

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
                  perPageCropTemplates: undefined,
                  manualCropTemplate: undefined,
                  gutter: 0,
                  keepFirstPageUnsplit: false,
                })
              }
            >
              <option value="powerpoint-2up-preset">PowerPoint 2-slide handout</option>
              <option value="per-page-2up-auto">Detect each page separately</option>
              <option value="single-slide-page">One slide per page</option>
              <option value="auto-detect">Auto-detect slide boxes</option>
              <option value="manual">Manual crop</option>
              <option value="simple-half-split">Simple half split</option>
            </select>
          </label>

          <div className="field-row">
            <label>
              Slide ratio
              <select
                value={settings.slideAspectRatio}
                onChange={(event) =>
                  patch({
                    slideAspectRatio: event.target.value as SplitSettings["slideAspectRatio"],
                  })
                }
              >
                <option value="auto">Auto</option>
                <option value="16:9">16:9</option>
                <option value="4:3">4:3</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              Custom
              <input
                type="number"
                min="0.5"
                step="0.01"
                value={settings.customAspectRatio ?? 1.78}
                disabled={settings.slideAspectRatio !== "custom"}
                onChange={(event) => patch({ customAspectRatio: Number(event.target.value) })}
              />
            </label>
          </div>

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

              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={settings.keepFirstPageUnsplit}
                  onChange={(event) => patch({ keepFirstPageUnsplit: event.target.checked })}
                />
                Keep first page unsplit
              </label>
            </>
          )}

          <fieldset>
            <legend>Outer margin trim</legend>
            <div className="margin-grid">
              <NumberField
                label="Top"
                value={settings.margins.top}
                onChange={(top) => patchMargins({ top })}
              />
              <NumberField
                label="Right"
                value={settings.margins.right}
                onChange={(right) => patchMargins({ right })}
              />
              <NumberField
                label="Bottom"
                value={settings.margins.bottom}
                onChange={(bottom) => patchMargins({ bottom })}
              />
              <NumberField
                label="Left"
                value={settings.margins.left}
                onChange={(left) => patchMargins({ left })}
              />
            </div>
          </fieldset>

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

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange(value: number): void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min="0"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function normalizeOrder(layout: SplitSettings["layout"]): SplitOrder {
  return layout === "top-bottom" ? "top-bottom" : "left-right";
}
