export class PageRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageRangeError";
  }
}

export function parsePageRange(input: string, pageCount: number): number[] {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || trimmed === "all") {
    return Array.from({ length: pageCount }, (_, index) => index);
  }

  const pages = new Set<number>();
  for (const rawPart of trimmed.split(",")) {
    const part = rawPart.trim();
    if (!part) {
      throw new PageRangeError("Page range contains an empty item.");
    }

    const openStart = part.match(/^-(\d+)$/);
    const openEnd = part.match(/^(\d+)-$/);
    const closed = part.match(/^(\d+)-(\d+)$/);
    const single = part.match(/^(\d+)$/);

    if (single) {
      addPage(pages, Number(single[1]), pageCount);
      continue;
    }

    if (openStart) {
      addRange(pages, 1, Number(openStart[1]), pageCount);
      continue;
    }

    if (openEnd) {
      addRange(pages, Number(openEnd[1]), pageCount, pageCount);
      continue;
    }

    if (closed) {
      addRange(pages, Number(closed[1]), Number(closed[2]), pageCount);
      continue;
    }

    throw new PageRangeError(
      "Use page ranges like all, 1, 1,3,5, 1-10, 2-, -5, or 1,3,5-8.",
    );
  }

  return [...pages].sort((a, b) => a - b);
}

function addPage(pages: Set<number>, page: number, pageCount: number) {
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    throw new PageRangeError(`Page ${page} is outside this PDF's 1-${pageCount} range.`);
  }
  pages.add(page - 1);
}

function addRange(
  pages: Set<number>,
  start: number,
  end: number,
  pageCount: number,
) {
  if (start > end) {
    throw new PageRangeError(`Page range ${start}-${end} runs backwards.`);
  }
  for (let page = start; page <= end; page += 1) {
    addPage(pages, page, pageCount);
  }
}
