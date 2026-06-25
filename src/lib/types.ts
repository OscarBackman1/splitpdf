export type SplitLayout = "top-bottom" | "left-right";

export type SplitOrder =
  | "top-bottom"
  | "bottom-top"
  | "left-right"
  | "right-left";

export type CropMode = "powerpoint-2up-preset" | "single-slide-page";

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
  gutter: number;
  keepFirstPageUnsplit: boolean;
  pageSelection: string;
  detectedCropTemplate?: CropTemplate;
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
  gutter: 0,
  keepFirstPageUnsplit: false,
  pageSelection: "all",
};
