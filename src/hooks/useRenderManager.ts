import { ref, type Ref } from 'vue';
import { createRenderManager, type RenderResult } from '../utils/renderManager';

interface UseRenderManagerOptions {
  rowCount: Readonly<Ref<number>>;
  rowHeight: Readonly<Ref<number>>;
  bufferRows: Readonly<Ref<number>>;
  bufferCols: Readonly<Ref<number>>;
  colWidths: Readonly<Ref<number[]>>;
}

export const useRenderManager = ({
  rowCount,
  rowHeight,
  bufferRows,
  bufferCols,
  colWidths,
}: UseRenderManagerOptions) => {
  const createManager = (widths: number[]) =>
    createRenderManager({
      rowCount: rowCount.value,
      rowHeight: rowHeight.value,
      colWidths: widths,
      bufferRows: bufferRows.value,
      bufferCols: bufferCols.value,
    });

  let currentWidths = colWidths.value.slice();
  let manager = createManager(currentWidths);
  const ranges = ref<RenderResult>(manager.getRanges(0, 0, 0, 0));

  const rebuildRenderManager = (widths = colWidths.value) => {
    currentWidths = widths.slice();
    manager = createManager(currentWidths);
  };

  const syncColumnWidths = (widths = colWidths.value) => {
    if (widths.length !== currentWidths.length) {
      rebuildRenderManager(widths);
      return;
    }
    currentWidths = widths.slice();
    manager.updateColumnWidths(currentWidths);
  };

  const calculateRanges = (viewportWidth: number, viewportHeight: number, scrollLeft: number, scrollTop: number) => {
    ranges.value = manager.getRanges(viewportWidth, viewportHeight, scrollLeft, scrollTop);
    return ranges.value;
  };

  return {
    ranges,
    calculateRanges,
    syncColumnWidths,
    rebuildRenderManager,
  };
};
