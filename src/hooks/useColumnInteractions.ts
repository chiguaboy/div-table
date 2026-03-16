import { computed, reactive, type ComputedRef, type Ref } from 'vue';
import type { ManagedColumn } from '../utils/columnManager';
import type { RenderResult } from '../utils/renderManager';

interface UseColumnInteractionsOptions {
  allColumns: Ref<ManagedColumn[]>;
  visibleColumns: ComputedRef<ManagedColumn[]>;
  ranges: Ref<RenderResult>;
  colRangeStart: Readonly<Ref<number>>;
  rowIndexWidth: Readonly<Ref<number>>;
  headerRef: Ref<HTMLDivElement | null>;
  scrollLeft: Readonly<Ref<number>>;
  resizeColumn: (columnIndex: number, width: number) => void;
  reorderColumns: (fromPosition: number, toPosition: number) => void;
  syncColumns: () => void;
}

const toFlexAlign = (align: ManagedColumn['align']) => {
  if (align === 'center') return 'center';
  if (align === 'right') return 'flex-end';
  return 'flex-start';
};

export const useColumnInteractions = ({
  allColumns,
  visibleColumns,
  ranges,
  colRangeStart,
  rowIndexWidth,
  headerRef,
  scrollLeft,
  resizeColumn,
  reorderColumns,
  syncColumns,
}: UseColumnInteractionsOptions) => {
  const resizeState = reactive({ active: false, startX: 0, startWidth: 0, colIndex: -1 });
  const dragState = reactive({ active: false, fromPosition: -1, toPosition: -1 });

  const startResize = (event: PointerEvent, colIndex: number) => {
    const col = allColumns.value.find((item) => item.index === colIndex);
    if (!col) return;
    resizeState.active = true;
    resizeState.startX = event.clientX;
    resizeState.startWidth = col.width;
    resizeState.colIndex = colIndex;
  };

  const startDrag = (event: PointerEvent, position: number) => {
    event.preventDefault();
    dragState.active = true;
    dragState.fromPosition = position;
    dragState.toPosition = position;
  };

  const onGlobalPointerMove = (event: PointerEvent) => {
    if (resizeState.active) {
      const nextWidth = resizeState.startWidth + (event.clientX - resizeState.startX);
      resizeColumn(resizeState.colIndex, nextWidth);
      syncColumns();
      return true;
    }
    if (!dragState.active) return false;

    const headerBounds = headerRef.value?.getBoundingClientRect();
    if (!headerBounds) return true;
    const relativeX = event.clientX - headerBounds.left + scrollLeft.value;
    const offsets = ranges.value.colOffsets;
    const cols = visibleColumns.value;
    if (cols.length === 0) {
      dragState.toPosition = -1;
      return true;
    }

    let target = cols.length - 1;
    for (let i = 0; i < cols.length; i += 1) {
      if (relativeX < offsets[i] + cols[i].width / 2) {
        target = i;
        break;
      }
    }
    dragState.toPosition = target;
    return true;
  };

  const stopResize = () => {
    resizeState.active = false;
  };

  const stopDrag = () => {
    if (!dragState.active) return;
    reorderColumns(dragState.fromPosition, dragState.toPosition);
    dragState.active = false;
    dragState.fromPosition = -1;
    dragState.toPosition = -1;
    syncColumns();
  };

  const dragIndicatorStyle = computed(() => {
    if (!dragState.active || dragState.toPosition < 0) return { opacity: '0' };
    const offsets = ranges.value.colOffsets;
    const base = offsets[colRangeStart.value] ?? 0;
    const visibleOffset = offsets[dragState.toPosition] ?? 0;
    return {
      opacity: '1',
      transform: `translateX(${visibleOffset - base + rowIndexWidth.value}px)`,
    };
  });

  const headerCellStyle = (col: ManagedColumn, position: number) => {
    const dragging = dragState.active && dragState.fromPosition === position;
    return {
      width: `${col.width}px`,
      justifyContent: toFlexAlign(col.align),
      transform: dragging ? 'scale(0.98)' : undefined,
      opacity: dragging ? '0.6' : '1',
      ...col.style,
    };
  };

  const cellStyle = (col: ManagedColumn, position: number) => {
    const dragTarget = dragState.active && dragState.toPosition === position;
    return {
      width: `${col.width}px`,
      justifyContent: toFlexAlign(col.align),
      boxShadow: dragTarget ? 'inset 2px 0 0 #3b82f6' : undefined,
    };
  };

  return {
    startResize,
    startDrag,
    onGlobalPointerMove,
    stopResize,
    stopDrag,
    dragIndicatorStyle,
    headerCellStyle,
    cellStyle,
  };
};
