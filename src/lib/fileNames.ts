export function defaultOutputName(fileName: string) {
  return `${fileName.replace(/\.pdf$/i, "")}_split.pdf`;
}

export function ensurePdfExtension(fileName: string) {
  const trimmed = fileName.trim() || "split_slides.pdf";
  return trimmed.toLowerCase().endsWith(".pdf") ? trimmed : `${trimmed}.pdf`;
}
