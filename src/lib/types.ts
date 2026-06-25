export type SplitLayout = "top-bottom" | "left-right";

export type SplitOrder =
  | "top-bottom"
  | "bottom-top"
  | "left-right"
  | "right-left";

export type CropMode =
  | "powerpoint-2up-preset"
  | "single-slide-page"
  | "auto-detect"
  | "manual"
  | "simple-half-split";

export type SlideAspectRatio = "auto" | "16:9" | "4:3" | "custom";

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ManualCropBox {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

export interface CropTemplate {
  first: ManualCropBox;
  second: ManualCropBox;
}

export interface SplitSettings {
  layout: SplitLayout;
  order: SplitOrder;
  cropMode: CropMode;
  slideAspectRatio: SlideAspectRatio;
  customAspectRatio?: number;
  gutter: number;
  margins: Margins;
  keepFirstPageUnsplit: boolean;
  pageSelection: string;
  detectedCropTemplate?: CropTemplate;
  manualCropTemplate?: CropTemplate;
  outputName?: string;
}

export interface SplitProgress {
  currentPage: number;
  totalPages: number;
}

export interface DetectionResult {
  template: CropTemplate;
  confidence: "high" | "medium" | "low";
  message: string;
}

export interface PageSize {
  width: number;
  height: number;
}

export const defaultSettings: SplitSettings = {
  layout: "top-bottom",
  order: "top-bottom",
  cropMode: "powerpoint-2up-preset",
  slideAspectRatio: "16:9",
  gutter: 0,
  margins: { top: 0, right: 0, bottom: 0, left: 0 },
  keepFirstPageUnsplit: false,
  pageSelection: "all",
};
