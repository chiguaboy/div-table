export interface RenderRange {
  start: number;
  end: number;
  offset: number;
}

export interface RenderResult {
  rowRange: RenderRange;
  colRange: RenderRange;
  totalWidth: number;
  totalHeight: number;
  colOffsets: number[];
}

export interface RenderManagerConfig {
  rowCount: number;
  colCount: number;
  rowHeight: number;
  colWidths: number[];
  bufferRows: number;
  bufferCols: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const buildColumnOffsets = (colWidths: number[]) => {
  const offsets: number[] = new Array(colWidths.length);
  let total = 0;
  for (let i = 0; i < colWidths.length; i += 1) {
    offsets[i] = total;
    total += colWidths[i];
  }
  return { offsets, total };
};

const findStartIndex = (offsets: number[], scrollLeft: number) => {
  let low = 0;
  let high = offsets.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = offsets[mid];
    if (value <= scrollLeft) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return clamp(low - 1, 0, offsets.length - 1);
};

const findEndIndex = (offsets: number[], colWidths: number[], viewportEnd: number, start: number) => {
  let index = start;
  while (index < offsets.length && offsets[index] + colWidths[index] < viewportEnd) {
    index += 1;
  }
  return clamp(index, 0, offsets.length - 1);
};

export const createRenderManager = (config: RenderManagerConfig) => {
  let cachedOffsets = buildColumnOffsets(config.colWidths);

  const updateColumnWidths = (widths: number[]) => {
    cachedOffsets = buildColumnOffsets(widths);
  };

  const getRanges = (
    viewportWidth: number,
    viewportHeight: number,
    scrollLeft: number,
    scrollTop: number,
  ): RenderResult => {
    const totalHeight = config.rowCount * config.rowHeight;
    const { offsets, total } = cachedOffsets;

    const rawRowStart = Math.floor(scrollTop / config.rowHeight);
    const rowStart = clamp(rawRowStart - config.bufferRows, 0, config.rowCount - 1);
    const rawRowEnd = Math.floor((scrollTop + viewportHeight) / config.rowHeight);
    const rowEnd = clamp(rawRowEnd + config.bufferRows, 0, config.rowCount - 1);

    const startIndex = findStartIndex(offsets, scrollLeft);
    const viewportEnd = scrollLeft + viewportWidth;
    const endIndex = findEndIndex(offsets, config.colWidths, viewportEnd, startIndex);
    const colStart = clamp(startIndex - config.bufferCols, 0, config.colCount - 1);
    const colEnd = clamp(endIndex + config.bufferCols, 0, config.colCount - 1);

    return {
      rowRange: {
        start: rowStart,
        end: rowEnd,
        offset: rowStart * config.rowHeight,
      },
      colRange: {
        start: colStart,
        end: colEnd,
        offset: offsets[colStart] ?? 0,
      },
      totalWidth: total,
      totalHeight,
      colOffsets: offsets,
    };
  };

  return {
    getRanges,
    updateColumnWidths,
  };
};
