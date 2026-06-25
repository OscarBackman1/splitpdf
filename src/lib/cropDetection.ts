import type {
  CropTemplate,
  DetectionResult,
  ManualCropBox,
  Margins,
  PageSize,
  SlideAspectRatio,
  SplitLayout,
} from "./types";

const WHITE_THRESHOLD = 246;
const MIN_INK_ALPHA = 12;

type CanvasRect = { x: number; y: number; width: number; height: number };

export function aspectRatioValue(
  ratio: SlideAspectRatio,
  customAspectRatio?: number,
): number {
  if (ratio === "4:3") return 4 / 3;
  if (ratio === "custom" && customAspectRatio && customAspectRatio > 0) {
    return customAspectRatio;
  }
  return 16 / 9;
}

export function simpleHalfTemplate(page: PageSize, layout: SplitLayout): CropTemplate {
  if (layout === "left-right") {
    const mid = page.width / 2;
    return {
      first: { left: 0, bottom: 0, right: mid, top: page.height },
      second: { left: mid, bottom: 0, right: page.width, top: page.height },
    };
  }

  const mid = page.height / 2;
  return {
    first: { left: 0, bottom: mid, right: page.width, top: page.height },
    second: { left: 0, bottom: 0, right: page.width, top: mid },
  };
}

export function presetTemplate(
  page: PageSize,
  layout: SplitLayout,
  ratio: number,
): CropTemplate {
  const firstRegion =
    layout === "top-bottom"
      ? { x: 0, y: 0, width: page.width, height: page.height / 2 }
      : { x: 0, y: 0, width: page.width / 2, height: page.height };
  const secondRegion =
    layout === "top-bottom"
      ? { x: 0, y: page.height / 2, width: page.width, height: page.height / 2 }
      : { x: page.width / 2, y: 0, width: page.width / 2, height: page.height };

  return {
    first: rectToPdfBox(fitRatio(firstRegion, ratio), page.height),
    second: rectToPdfBox(fitRatio(secondRegion, ratio), page.height),
  };
}

export function powerpointHandoutTemplate(
  page: PageSize,
  layout: SplitLayout,
  ratio: number,
): CropTemplate {
  if (layout === "left-right") {
    const slideHeight = page.height * 0.78;
    const slideWidth = slideHeight * ratio;
    const outerX = Math.max(0, (page.width - slideWidth * 2) * 0.35);
    const y = (page.height - slideHeight) / 2;
    return {
      first: {
        left: outerX,
        bottom: y,
        right: outerX + slideWidth,
        top: y + slideHeight,
      },
      second: {
        left: page.width - outerX - slideWidth,
        bottom: y,
        right: page.width - outerX,
        top: y + slideHeight,
      },
    };
  }

  const slideWidth = page.width * 0.7843137255;
  const slideHeight = slideWidth / ratio;
  const outerY = Math.max(0, (page.height - slideHeight * 2) * 0.35);
  const x = (page.width - slideWidth) / 2;
  return {
    first: {
      left: x,
      bottom: page.height - outerY - slideHeight,
      right: x + slideWidth,
      top: page.height - outerY,
    },
    second: {
      left: x,
      bottom: outerY,
      right: x + slideWidth,
      top: outerY + slideHeight,
    },
  };
}

export function slideFrameTemplate(
  canvas: HTMLCanvasElement,
  page: PageSize,
  layout: SplitLayout,
  ratio: number,
): DetectionResult | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const halfRects =
    layout === "top-bottom"
      ? [
          { x: 0, y: 0, width: canvas.width, height: canvas.height / 2 },
          { x: 0, y: canvas.height / 2, width: canvas.width, height: canvas.height / 2 },
        ]
      : [
          { x: 0, y: 0, width: canvas.width / 2, height: canvas.height },
          { x: canvas.width / 2, y: 0, width: canvas.width / 2, height: canvas.height },
        ];

  const boxes = halfRects.map((rect) => detectOneBox(image, rect, ratio));
  if (!boxes[0].frame || !boxes[1].frame) {
    const bandResult = slideBandTemplate(image, canvas, page, layout);
    return bandResult?.confidence === "low" ? null : bandResult;
  }

  return {
    template: normalizeFrameTemplateToLayout(
      {
        first: canvasRectToPdfBox(boxes[0].rect, canvas, page),
        second: canvasRectToPdfBox(boxes[1].rect, canvas, page),
      },
      page,
      layout,
    ),
    confidence: "high",
    message: "Detected slide frames with high confidence",
  };
}

export function detectTemplateFromCanvas(
  canvas: HTMLCanvasElement,
  page: PageSize,
  layout: SplitLayout,
  ratioKind: SlideAspectRatio,
  customAspectRatio?: number,
): DetectionResult {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      template: presetTemplate(page, layout, aspectRatioValue(ratioKind, customAspectRatio)),
      confidence: "low",
      message: "Detection uncertain - preview canvas was unavailable.",
    };
  }

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const halfRects =
    layout === "top-bottom"
      ? [
          { x: 0, y: 0, width: canvas.width, height: canvas.height / 2 },
          { x: 0, y: canvas.height / 2, width: canvas.width, height: canvas.height / 2 },
        ]
      : [
          { x: 0, y: 0, width: canvas.width / 2, height: canvas.height },
          { x: canvas.width / 2, y: 0, width: canvas.width / 2, height: canvas.height },
        ];

  const ratio =
    ratioKind === "auto"
      ? inferRatioFromCanvas(image, halfRects) ?? 16 / 9
      : aspectRatioValue(ratioKind, customAspectRatio);

  const boxes = halfRects.map((rect) => detectOneBox(image, rect, ratio));
  const bandResult =
    boxes[0].frame && boxes[1].frame ? null : slideBandTemplate(image, canvas, page, layout);
  if (bandResult && bandResult.confidence !== "low") return bandResult;

  const rawTemplate = {
    first: canvasRectToPdfBox(boxes[0].rect, canvas, page),
    second: canvasRectToPdfBox(boxes[1].rect, canvas, page),
  };
  const template =
    boxes[0].frame && boxes[1].frame
      ? normalizeFrameTemplateToLayout(rawTemplate, page, layout)
      : normalizeTemplateToLayout(rawTemplate, page, layout);
  const score = Math.min(boxes[0].score, boxes[1].score);
  const label = ratioKind === "auto" ? formatRatio(ratio) : ratioKind;

  if (score > 0.72) {
    return {
      template,
      confidence: "high",
      message: `Detected ${label} slide boxes with high confidence`,
    };
  }

  if (score > 0.45) {
    return {
      template,
      confidence: "medium",
      message: `Detected ${label} slide boxes with medium confidence`,
    };
  }

  return {
    template,
    confidence: "low",
    message: "Detection uncertain - adjust crop boxes manually",
  };
}

function slideBandTemplate(
  image: ImageData,
  canvas: HTMLCanvasElement,
  page: PageSize,
  layout: SplitLayout,
): DetectionResult | null {
  const pair = detectSlideBandRects(image, layout);
  if (!pair) return null;

  const rawTemplate = {
    first: canvasRectToPdfBox(pair.rects[0], canvas, page),
    second: canvasRectToPdfBox(pair.rects[1], canvas, page),
  };
  const confidence = pair.score > 0.76 ? "high" : pair.score > 0.58 ? "medium" : "low";

  return {
    template: normalizeTemplateToLayout(rawTemplate, page, layout),
    confidence,
    message:
      confidence === "high"
        ? "Detected embedded slide images with high confidence"
        : "Detected embedded slide images with medium confidence",
  };
}

function detectSlideBandRects(
  image: ImageData,
  layout: SplitLayout,
): { rects: [CanvasRect, CanvasRect]; score: number } | null {
  const vertical = layout === "top-bottom";
  const primarySize = vertical ? image.height : image.width;
  const crossSize = vertical ? image.width : image.height;
  const projection = new Array(primarySize).fill(0) as number[];

  for (let primary = 0; primary < primarySize; primary += 1) {
    for (let cross = 0; cross < crossSize; cross += 1) {
      const x = vertical ? cross : primary;
      const y = vertical ? primary : cross;
      if (isInk(image, x, y)) projection[primary] += 1;
    }
  }

  const threshold = Math.max(14, Math.floor(crossSize * 0.035));
  const maxGap = Math.max(8, Math.min(42, Math.floor(primarySize * 0.028)));
  const minLength = Math.max(40, Math.floor(primarySize * 0.12));
  const runs = projectionRuns(projection, threshold, maxGap)
    .filter((run) => run.end - run.start >= minLength)
    .map((run) => ({
      ...run,
      strength: projection.slice(run.start, run.end).reduce((sum, count) => sum + count, 0),
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 4)
    .sort((a, b) => a.start - b.start);

  if (runs.length < 2) return null;

  let best: { rects: [CanvasRect, CanvasRect]; score: number } | null = null;

  for (let firstIndex = 0; firstIndex < runs.length - 1; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < runs.length; secondIndex += 1) {
      const first = rectForBand(image, runs[firstIndex], layout);
      const second = rectForBand(image, runs[secondIndex], layout);
      if (!first || !second) continue;

      const firstCross = vertical ? first.width : first.height;
      const secondCross = vertical ? second.width : second.height;
      const firstPrimary = vertical ? first.height : first.width;
      const secondPrimary = vertical ? second.height : second.width;
      const crossConsistency =
        1 - Math.abs(firstCross - secondCross) / Math.max(firstCross, secondCross, 1);
      const primaryConsistency =
        1 - Math.abs(firstPrimary - secondPrimary) / Math.max(firstPrimary, secondPrimary, 1);
      const crossCoverage = Math.min(firstCross, secondCross) / crossSize;
      const primaryCoverage = (firstPrimary + secondPrimary) / primarySize;
      const score =
        crossConsistency * 0.34 +
        primaryConsistency * 0.24 +
        Math.min(1, crossCoverage / 0.58) * 0.24 +
        Math.min(1, primaryCoverage / 0.54) * 0.18;

      if (!best || score > best.score) {
        best = { rects: [first, second], score };
      }
    }
  }

  if (!best || best.score < 0.5) return null;
  return best;
}

function rectForBand(
  image: ImageData,
  run: { start: number; end: number },
  layout: SplitLayout,
): CanvasRect | null {
  const vertical = layout === "top-bottom";
  const primaryStart = run.start;
  const primaryEnd = run.end;
  const primaryLength = primaryEnd - primaryStart;
  const crossSize = vertical ? image.width : image.height;
  const crossCounts = new Array(crossSize).fill(0) as number[];

  for (let primary = primaryStart; primary < primaryEnd; primary += 1) {
    for (let cross = 0; cross < crossSize; cross += 1) {
      const x = vertical ? cross : primary;
      const y = vertical ? primary : cross;
      if (isInk(image, x, y)) crossCounts[cross] += 1;
    }
  }

  const threshold = Math.max(8, Math.floor(primaryLength * 0.025));
  const crossRange = qualifiedRange(crossCounts, threshold);
  if (!crossRange) return null;

  const pad = Math.max(3, Math.min(image.width, image.height) * 0.004);
  if (vertical) {
    const x = Math.max(0, crossRange.start - pad);
    const y = Math.max(0, primaryStart - pad);
    const right = Math.min(image.width, crossRange.end + pad);
    const bottom = Math.min(image.height, primaryEnd + pad);
    return { x, y, width: right - x, height: bottom - y };
  }

  const x = Math.max(0, primaryStart - pad);
  const y = Math.max(0, crossRange.start - pad);
  const right = Math.min(image.width, primaryEnd + pad);
  const bottom = Math.min(image.height, crossRange.end + pad);
  return { x, y, width: right - x, height: bottom - y };
}

function projectionRuns(counts: number[], threshold: number, maxGap: number) {
  const runs: Array<{ start: number; end: number }> = [];
  let start = -1;
  let lastQualified = -1;
  let gap = 0;

  for (let index = 0; index <= counts.length; index += 1) {
    const count = counts[index] ?? 0;
    if (count >= threshold) {
      if (start === -1) start = index;
      lastQualified = index + 1;
      gap = 0;
      continue;
    }

    if (start !== -1) {
      gap += 1;
      if (gap > maxGap || index === counts.length) {
        runs.push({ start, end: lastQualified });
        start = -1;
        lastQualified = -1;
        gap = 0;
      }
    }
  }

  return runs;
}

export function applyAdjustments(
  template: CropTemplate,
  page: PageSize,
  layout: SplitLayout,
  gutter: number,
  margins: Margins,
): CropTemplate {
  return {
    first: clampBox(adjustBox(template.first, page, layout, gutter, margins, true), page),
    second: clampBox(adjustBox(template.second, page, layout, gutter, margins, false), page),
  };
}

export function normalizeTemplateToLayout(
  template: CropTemplate,
  page: PageSize,
  layout: SplitLayout,
): CropTemplate {
  const firstWidth = template.first.right - template.first.left;
  const secondWidth = template.second.right - template.second.left;
  const firstHeight = template.first.top - template.first.bottom;
  const secondHeight = template.second.top - template.second.bottom;
  const width = Math.max(firstWidth, secondWidth);
  const height = Math.max(firstHeight, secondHeight);

  if (layout === "left-right") {
    const centerY =
      (template.first.bottom + firstHeight / 2 + template.second.bottom + secondHeight / 2) / 2;
    return {
      first: clampBox(centeredBox(template.first.left + firstWidth / 2, centerY, width, height), page),
      second: clampBox(centeredBox(template.second.left + secondWidth / 2, centerY, width, height), page),
    };
  }

  const centerX =
    (template.first.left + firstWidth / 2 + template.second.left + secondWidth / 2) / 2;
  return {
    first: clampBox(centeredBox(centerX, template.first.bottom + firstHeight / 2, width, height), page),
    second: clampBox(centeredBox(centerX, template.second.bottom + secondHeight / 2, width, height), page),
  };
}

export function normalizeFrameTemplateToLayout(
  template: CropTemplate,
  page: PageSize,
  layout: SplitLayout,
): CropTemplate {
  const firstWidth = template.first.right - template.first.left;
  const secondWidth = template.second.right - template.second.left;
  const firstHeight = template.first.top - template.first.bottom;
  const secondHeight = template.second.top - template.second.bottom;
  const framePad = Math.max(1.5, Math.min(page.width, page.height) * 0.003);

  if (layout === "left-right") {
    const bottom = Math.min(template.first.bottom, template.second.bottom) - framePad;
    const top = Math.max(template.first.top, template.second.top) + framePad;
    const width = Math.max(firstWidth, secondWidth) + framePad * 2;
    return {
      first: clampBox(
        centeredBox(template.first.left + firstWidth / 2, (bottom + top) / 2, width, top - bottom),
        page,
      ),
      second: clampBox(
        centeredBox(template.second.left + secondWidth / 2, (bottom + top) / 2, width, top - bottom),
        page,
      ),
    };
  }

  const left = Math.min(template.first.left, template.second.left) - framePad;
  const right = Math.max(template.first.right, template.second.right) + framePad;
  const height = Math.max(firstHeight, secondHeight) + framePad * 2;
  return {
    first: clampBox(
      centeredBox((left + right) / 2, template.first.bottom + firstHeight / 2, right - left, height),
      page,
    ),
    second: clampBox(
      centeredBox((left + right) / 2, template.second.bottom + secondHeight / 2, right - left, height),
      page,
    ),
  };
}

function centeredBox(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
): ManualCropBox {
  return {
    left: centerX - width / 2,
    right: centerX + width / 2,
    bottom: centerY - height / 2,
    top: centerY + height / 2,
  };
}

export function orderBoxes(
  template: CropTemplate,
  order: "top-bottom" | "bottom-top" | "left-right" | "right-left",
): ManualCropBox[] {
  if (order === "bottom-top" || order === "right-left") {
    return [template.second, template.first];
  }
  return [template.first, template.second];
}

export function validateBox(box: ManualCropBox) {
  if (box.right <= box.left || box.top <= box.bottom) {
    throw new Error("Invalid crop settings: each crop box needs positive width and height.");
  }
}

function detectOneBox(
  image: ImageData,
  region: CanvasRect,
  ratio: number,
) {
  const frame = framedSlideBounds(image, region, ratio);
  const bounds = frame?.rect ?? projectedInkBounds(image, region) ?? inkBounds(image, region);
  const fitted = fitRatio(bounds, ratio);
  const fallback = fitRatio(region, ratio);
  const useBounds = bounds.width > region.width * 0.2 && bounds.height > region.height * 0.2;
  const rect = useBounds ? fitted : fallback;
  const fill = (rect.width * rect.height) / (region.width * region.height);
  const score = frame ? frame.score : useBounds ? Math.min(1, fill * 1.35) : 0.25;
  return { rect, score, frame: Boolean(frame) };
}

function framedSlideBounds(
  image: ImageData,
  region: CanvasRect,
  expectedRatio: number,
) {
  const left = Math.max(0, Math.floor(region.x));
  const top = Math.max(0, Math.floor(region.y));
  const right = Math.min(image.width, Math.ceil(region.x + region.width));
  const bottom = Math.min(image.height, Math.ceil(region.y + region.height));
  const rowDarkCounts = new Array(bottom - top).fill(0) as number[];
  const colDarkCounts = new Array(right - left).fill(0) as number[];

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (isDarkRulePixel(image, x, y)) {
        rowDarkCounts[y - top] += 1;
        colDarkCounts[x - left] += 1;
      }
    }
  }

  const minHorizontalRule = Math.max(80, Math.floor((right - left) * 0.42));
  const minVerticalRule = Math.max(50, Math.floor((bottom - top) * 0.34));
  const horizontalRuns = ruleRuns(rowDarkCounts, minHorizontalRule);
  const verticalRuns = ruleRuns(colDarkCounts, minVerticalRule);

  let best:
    | {
        rect: { x: number; y: number; width: number; height: number };
        score: number;
      }
    | null = null;

  for (const topRule of horizontalRuns) {
    for (const bottomRule of horizontalRuns) {
      if (bottomRule.center <= topRule.center) continue;
      const frameHeight = bottomRule.center - topRule.center;
      if (frameHeight < region.height * 0.22) continue;

      for (const leftRule of verticalRuns) {
        for (const rightRule of verticalRuns) {
          if (rightRule.center <= leftRule.center) continue;
          const frameWidth = rightRule.center - leftRule.center;
          if (frameWidth < region.width * 0.35) continue;

          const detectedRatio = frameWidth / frameHeight;
          if (detectedRatio < 1.05 || detectedRatio > 2.4) continue;

          const ratioError = Math.abs(detectedRatio - expectedRatio) / expectedRatio;
          if (ratioError > 0.18) continue;

          const horizontalStrength =
            (topRule.max + bottomRule.max) / 2 / Math.max(1, frameWidth);
          const verticalStrength =
            (leftRule.max + rightRule.max) / 2 / Math.max(1, frameHeight);
          const areaShare = (frameWidth * frameHeight) / (region.width * region.height);
          const score = Math.min(
            1,
            areaShare * 0.8 +
              (1 - ratioError) * 0.25 +
              horizontalStrength * 0.08 +
              verticalStrength * 0.08,
          );

          if (!best || score > best.score) {
            best = {
              rect: {
                x: left + leftRule.center,
                y: top + topRule.center,
                width: frameWidth,
                height: frameHeight,
              },
              score,
            };
          }
        }
      }
    }
  }

  return best && best.score > 0.5 ? best : null;
}

function ruleRuns(counts: number[], threshold: number) {
  const runs: Array<{ start: number; end: number; center: number; max: number }> = [];
  let start = -1;
  let max = 0;

  for (let index = 0; index <= counts.length; index += 1) {
    const count = counts[index] ?? 0;
    if (count >= threshold) {
      if (start === -1) start = index;
      max = Math.max(max, count);
      continue;
    }

    if (start !== -1) {
      const end = index;
      runs.push({
        start,
        end,
        center: (start + end - 1) / 2,
        max,
      });
      start = -1;
      max = 0;
    }
  }

  return runs;
}

function projectedInkBounds(
  image: ImageData,
  region: CanvasRect,
) {
  const left = Math.max(0, Math.floor(region.x));
  const top = Math.max(0, Math.floor(region.y));
  const right = Math.min(image.width, Math.ceil(region.x + region.width));
  const bottom = Math.min(image.height, Math.ceil(region.y + region.height));
  const rowCounts = new Array(bottom - top).fill(0) as number[];

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (isInk(image, x, y)) {
        rowCounts[y - top] += 1;
      }
    }
  }

  const minRowInk = Math.max(8, Math.floor((right - left) * 0.025));
  const yRange = qualifiedRange(rowCounts, minRowInk);
  if (!yRange) return null;

  const colCounts = new Array(right - left).fill(0) as number[];
  const qualifiedTop = top + yRange.start;
  const qualifiedBottom = top + yRange.end;
  for (let y = qualifiedTop; y < qualifiedBottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (isInk(image, x, y)) {
        colCounts[x - left] += 1;
      }
    }
  }

  const minColInk = Math.max(8, Math.floor((qualifiedBottom - qualifiedTop) * 0.025));
  const xRange = qualifiedRange(colCounts, minColInk);
  if (!xRange) return null;

  const pad = Math.max(8, Math.min(region.width, region.height) * 0.012);
  const x = Math.max(region.x, left + xRange.start - pad);
  const y = Math.max(region.y, top + yRange.start - pad);
  const maxX = Math.min(region.x + region.width, left + xRange.end + pad);
  const maxY = Math.min(region.y + region.height, top + yRange.end + pad);
  const width = maxX - x;
  const height = maxY - y;

  if (width < region.width * 0.18 || height < region.height * 0.18) return null;
  return { x, y, width, height };
}

function qualifiedRange(counts: number[], threshold: number) {
  let start = -1;
  let end = -1;
  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] >= threshold) {
      if (start === -1) start = index;
      end = index + 1;
    }
  }

  if (start === -1 || end <= start) return null;
  return { start, end };
}

function inkBounds(
  image: ImageData,
  region: CanvasRect,
) {
  let minX = region.x + region.width;
  let minY = region.y + region.height;
  let maxX = region.x;
  let maxY = region.y;
  const left = Math.max(0, Math.floor(region.x));
  const top = Math.max(0, Math.floor(region.y));
  const right = Math.min(image.width, Math.ceil(region.x + region.width));
  const bottom = Math.min(image.height, Math.ceil(region.y + region.height));

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (isInk(image, x, y)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    return region;
  }

  const pad = Math.max(8, Math.min(region.width, region.height) * 0.015);
  return {
    x: Math.max(region.x, minX - pad),
    y: Math.max(region.y, minY - pad),
    width: Math.min(region.x + region.width, maxX + pad) - Math.max(region.x, minX - pad),
    height: Math.min(region.y + region.height, maxY + pad) - Math.max(region.y, minY - pad),
  };
}

function isInk(image: ImageData, x: number, y: number) {
  const index = (y * image.width + x) * 4;
  const r = image.data[index];
  const g = image.data[index + 1];
  const b = image.data[index + 2];
  const a = image.data[index + 3];
  return a > MIN_INK_ALPHA && (r < WHITE_THRESHOLD || g < WHITE_THRESHOLD || b < WHITE_THRESHOLD);
}

function isDarkRulePixel(image: ImageData, x: number, y: number) {
  const index = (y * image.width + x) * 4;
  const r = image.data[index];
  const g = image.data[index + 1];
  const b = image.data[index + 2];
  const a = image.data[index + 3];
  return a > MIN_INK_ALPHA && r < 120 && g < 120 && b < 120;
}

function fitRatio(
  rect: CanvasRect,
  ratio: number,
) {
  const current = rect.width / rect.height;
  if (current > ratio) {
    const width = rect.height * ratio;
    return { x: rect.x + (rect.width - width) / 2, y: rect.y, width, height: rect.height };
  }

  const height = rect.width / ratio;
  return { x: rect.x, y: rect.y + (rect.height - height) / 2, width: rect.width, height };
}

function rectToPdfBox(
  rect: CanvasRect,
  pageHeight: number,
): ManualCropBox {
  return {
    left: rect.x,
    right: rect.x + rect.width,
    top: pageHeight - rect.y,
    bottom: pageHeight - rect.y - rect.height,
  };
}

function canvasRectToPdfBox(
  rect: CanvasRect,
  canvas: HTMLCanvasElement,
  page: PageSize,
): ManualCropBox {
  const xScale = page.width / canvas.width;
  const yScale = page.height / canvas.height;
  return {
    left: rect.x * xScale,
    right: (rect.x + rect.width) * xScale,
    top: page.height - rect.y * yScale,
    bottom: page.height - (rect.y + rect.height) * yScale,
  };
}

function adjustBox(
  box: ManualCropBox,
  page: PageSize,
  layout: SplitLayout,
  gutter: number,
  margins: Margins,
  first: boolean,
): ManualCropBox {
  const next = {
    left: box.left + margins.left,
    right: box.right - margins.right,
    bottom: box.bottom + margins.bottom,
    top: box.top - margins.top,
  };

  if (layout === "top-bottom") {
    if (first) next.bottom += gutter;
    else next.top -= gutter;
  } else if (first) {
    next.right -= gutter;
  } else {
    next.left += gutter;
  }

  return next;
}

export function clampBox(box: ManualCropBox, page: PageSize): ManualCropBox {
  return {
    left: clamp(box.left, 0, page.width),
    right: clamp(box.right, 0, page.width),
    bottom: clamp(box.bottom, 0, page.height),
    top: clamp(box.top, 0, page.height),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function inferRatioFromCanvas(
  image: ImageData,
  regions: Array<{ x: number; y: number; width: number; height: number }>,
) {
  const ratios = regions
    .map((region) => inkBounds(image, region))
    .filter((box) => box.width > 10 && box.height > 10)
    .map((box) => box.width / box.height);
  if (ratios.length === 0) return null;
  const avg = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
  return Math.abs(avg - 4 / 3) < Math.abs(avg - 16 / 9) ? 4 / 3 : 16 / 9;
}

function formatRatio(ratio: number) {
  return Math.abs(ratio - 4 / 3) < 0.08 ? "4:3" : "16:9";
}
