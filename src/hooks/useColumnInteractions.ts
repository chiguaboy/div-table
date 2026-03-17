import { reactive, type ComputedRef, type Ref } from 'vue';
import type { ManagedColumn } from '../utils/columnManager';

interface UseColumnInteractionsOptions {
  allColumns: Ref<ManagedColumn[]>;
  visibleColumns: ComputedRef<ManagedColumn[]>;
  headerRef: Ref<HTMLDivElement | null>;
  scrollLeft: Readonly<Ref<number>>;
  resizeColumn: (columnIndex: number, width: number) => void;
  reorderColumns: (fromPosition: number, toPosition: number) => void;
}

export const useColumnInteractions = ({
  allColumns,
  visibleColumns,
  headerRef,
  scrollLeft,
  resizeColumn,
  reorderColumns,
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
      return true;
    }
    if (!dragState.active) return false;

    const headerBounds = headerRef.value?.getBoundingClientRect();
    if (!headerBounds) return true;
    const relativeX = event.clientX - headerBounds.left + scrollLeft.value;
    const cols = visibleColumns.value;
    if (cols.length === 0) {
      dragState.toPosition = -1;
      return true;
    }

    const offsets: number[] = new Array(cols.length);
    let offset = 0;
    for (let i = 0; i < cols.length; i += 1) {
      offsets[i] = offset;
      offset += cols[i].width;
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
  };

  const headerCellDragClass = (position: number) =>
    dragState.active && dragState.fromPosition === position ? 'is-dragging' : '';

  const cellDragClass = (position: number) =>
    dragState.active && dragState.toPosition === position ? 'is-drag-target' : '';

  return {
    dragState,
    startResize,
    startDrag,
    onGlobalPointerMove,
    stopResize,
    stopDrag,
    headerCellDragClass,
    cellDragClass,
  };
};
