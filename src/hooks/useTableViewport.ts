import { computed, reactive, watch, type Ref } from 'vue';
import type { ManagedColumn } from '../utils/columnManager';
import type { DataManager } from '../utils/dataManager';
import { useDataManager } from './useDataManager';
import { useRenderManager } from './useRenderManager';

interface UseTableViewportOptions {
  rowCount: Readonly<Ref<number>>;
  rowHeight: Readonly<Ref<number>>;
  bufferRows: Readonly<Ref<number>>;
  bufferCols: Readonly<Ref<number>>;
  rowIndexWidth: Readonly<Ref<number>>;
  bodyRef: Ref<HTMLDivElement | null>;
  headerRef: Ref<HTMLDivElement | null>;
  wrapperRef: Ref<HTMLDivElement | null>;
  visibleColumns: Readonly<Ref<ManagedColumn[]>>;
  dataManager: Readonly<Ref<DataManager>>;
  headerHeight?: number;
}

export const useTableViewport = ({
  rowCount,
  rowHeight,
  bufferRows,
  bufferCols,
  rowIndexWidth,
  bodyRef,
  headerRef,
  wrapperRef,
  visibleColumns,
  dataManager,
  headerHeight = 40,
}: UseTableViewportOptions) => {
  const state = reactive({ viewportWidth: 0, viewportHeight: 0, scrollLeft: 0, scrollTop: 0 });
  const scrollbarState = reactive({ horizontal: 0 });
  const visibleColumnWidths = computed(() => visibleColumns.value.map((col) => col.width));

  const { ranges, calculateRanges, syncColumnWidths, rebuildRenderManager } = useRenderManager({
    rowCount,
    rowHeight,
    bufferRows,
    bufferCols,
    colWidths: visibleColumnWidths,
  });

  const { ensureRange, getCellValue, updateCell, refreshData } = useDataManager({
    dataManager,
  });

  let scrollRaf = 0;

  const visibleRows = computed(() => {
    const { start, end } = ranges.value.rowRange;
    if (end < start) return [];
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  });

  const visibleCols = computed(() => {
    const { start, end } = ranges.value.colRange;
    if (end < start) return [];
    return visibleColumns.value.slice(start, end + 1);
  });

  const totalWidth = computed(() => ranges.value.totalWidth);
  const totalHeight = computed(() => ranges.value.totalHeight);
  const contentWidth = computed(() => totalWidth.value + rowIndexWidth.value);
  const rowRange = computed(() => ranges.value.rowRange);
  const colRange = computed(() => ranges.value.colRange);

  const syncScrollbarSize = () => {
    const body = bodyRef.value;
    if (!body) return;
    const measured = Math.max(0, body.offsetHeight - body.clientHeight);
    const hasHorizontalOverflow = body.scrollWidth > body.clientWidth + 1;
    const overlayFallback = hasHorizontalOverflow ? 10 : 0;
    const horizontal = Math.max(measured, overlayFallback);
    if (scrollbarState.horizontal !== horizontal) {
      scrollbarState.horizontal = horizontal;
    }
  };

  const updateRanges = () => {
    const nextRanges = calculateRanges(state.viewportWidth, state.viewportHeight, state.scrollLeft, state.scrollTop);
    void ensureRange(nextRanges.rowRange.start, nextRanges.rowRange.end);
    syncScrollbarSize();
  };

  const scheduleScrollUpdate = () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      if (headerRef.value) headerRef.value.scrollLeft = state.scrollLeft;
      updateRanges();
      scrollRaf = 0;
    });
  };

  const updateViewportSize = (width: number, height: number) => {
    state.viewportWidth = Math.max(0, width - rowIndexWidth.value);
    state.viewportHeight = Math.max(0, height - headerHeight);
  };

  const syncViewportFromWrapper = () => {
    const wrapper = wrapperRef.value;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    updateViewportSize(rect.width, rect.height);
  };

  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    updateViewportSize(entry.contentRect.width, entry.contentRect.height);
    updateRanges();
  });

  const onScroll = (event: Event) => {
    const target = event.target as HTMLDivElement;
    state.scrollLeft = target.scrollLeft;
    state.scrollTop = target.scrollTop;
    scheduleScrollUpdate();
  };

  const applyScrollOffset = (left?: number, top?: number) => {
    const body = bodyRef.value;
    if (!body) return;
    if (typeof left === 'number') body.scrollLeft = left;
    if (typeof top === 'number') body.scrollTop = top;
    state.scrollLeft = body.scrollLeft;
    state.scrollTop = body.scrollTop;
    scheduleScrollUpdate();
  };

  watch(visibleColumnWidths, (widths) => {
    syncColumnWidths(widths);
    updateRanges();
  });

  const mountViewport = () => {
    if (wrapperRef.value) resizeObserver.observe(wrapperRef.value);
    syncViewportFromWrapper();
    updateRanges();
  };

  const unmountViewport = () => {
    resizeObserver.disconnect();
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
  };

  return {
    state,
    scrollbarState,
    ranges,
    visibleRows,
    visibleCols,
    totalWidth,
    totalHeight,
    contentWidth,
    rowRange,
    colRange,
    onScroll,
    applyScrollOffset,
    rebuildRenderManager,
    syncColumnWidths,
    updateRanges,
    mountViewport,
    unmountViewport,
    syncViewportFromWrapper,
    getCellValue,
    updateCell,
    refreshData,
  };
};
