<template>
  <div class="div-table" ref="wrapperRef">
    <div class="div-table__header" ref="headerRef">
      <div class="div-table__header-inner" :style="headerInnerStyle">
        <div
          v-for="(col, position) in visibleCols"
          :key="col.key"
          class="div-table__header-cell"
          :style="headerCellStyle(col, position)"
          :class="headerCellClass(col.index)"
        >
          <button
            class="div-table__drag-handle"
            title="拖拽调整列顺序"
            @pointerdown.stop="startDrag($event, position)"
          >
            ↕
          </button>

          <div class="div-table__header-center" @click="selectColumn(col.index)" @dblclick="startRename(col)">
            <input
              v-if="renameState.index === col.index"
              class="div-table__rename-input"
              :value="renameState.value"
              @input="onRenameInput"
              @blur="commitRename"
              @keydown.enter.prevent="commitRename"
              @keydown.esc.prevent="cancelRename"
            />
            <slot v-else name="header" :column="col">
              <span class="div-table__header-label">{{ col.label }}</span>
            </slot>
          </div>

          <button
            class="div-table__resize-handle"
            title="拖拽调整列宽"
            @pointerdown.stop="startResize($event, col.index)"
          >
            ⋮
          </button>
        </div>
      </div>
      <div class="div-table__drag-indicator" :style="dragIndicatorStyle"></div>
    </div>

    <div class="div-table__body" ref="bodyRef" @scroll="onScroll" @pointerdown="onBodyPointerDown" @pointermove="onBodyPointerMove">
      <div class="div-table__spacer" :style="{ width: `${totalWidth}px`, height: `${totalHeight}px` }"></div>
      <div class="div-table__grid" :style="gridStyle">
        <div v-for="row in visibleRows" :key="row" class="div-table__row" :style="{ height: `${rowHeight}px` }">
          <div
            v-for="(col, position) in visibleCols"
            :key="col.key"
            class="div-table__cell"
            :data-row="row"
            :data-col="col.index"
            :style="cellStyle(col, position)"
            :class="cellClass(row, col.index)"
            @dblclick="startEditing(row, col.index)"
          >
            <input
              v-if="isEditing(row, col.index)"
              class="div-table__cell-input"
              :value="editing.value"
              @input="onEditInput"
              @blur="commitEdit"
              @keydown.enter.prevent="commitEdit"
            />
            <template v-else>
              {{ getCellValue(row, col.index) }}
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type { DataManager } from '../utils/dataManager';
import { createColumnManager, type ColumnDef, type ManagedColumn } from '../utils/columnManager';
import { createRenderManager } from '../utils/renderManager';

const props = defineProps<{
  columns: ColumnDef[];
  rowCount: number;
  rowHeight: number;
  bufferRows: number;
  bufferCols: number;
  dataManager: DataManager;
}>();

const wrapperRef = ref<HTMLDivElement | null>(null);
const bodyRef = ref<HTMLDivElement | null>(null);
const headerRef = ref<HTMLDivElement | null>(null);
const headerHeight = 40;

const state = reactive({ viewportWidth: 0, viewportHeight: 0, scrollLeft: 0, scrollTop: 0 });
const columnManager = createColumnManager(props.columns);
const allColumns = ref(columnManager.getColumns().slice());

let currentWidths = columnManager.getColumnWidths();
let renderManager = createRenderManager({
  rowCount: props.rowCount,
  rowHeight: props.rowHeight,
  colWidths: currentWidths,
  bufferRows: props.bufferRows,
  bufferCols: props.bufferCols,
});

const ranges = ref(renderManager.getRanges(0, 0, 0, 0));

const visibleColumnsAll = computed(() => allColumns.value.filter((col) => col.visible));
const visibleRows = computed(() => {
  const { start, end } = ranges.value.rowRange;
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
});
const visibleCols = computed(() => {
  const { start, end } = ranges.value.colRange;
  return visibleColumnsAll.value.slice(start, end + 1);
});

const totalWidth = computed(() => ranges.value.totalWidth);
const totalHeight = computed(() => ranges.value.totalHeight);
const rowRange = computed(() => ranges.value.rowRange);
const colRange = computed(() => ranges.value.colRange);

const syncColumns = () => {
  allColumns.value = columnManager.getColumns().slice();
  const widths = columnManager.getColumnWidths();
  if (widths.length !== currentWidths.length) {
    renderManager = createRenderManager({
      rowCount: props.rowCount,
      rowHeight: props.rowHeight,
      colWidths: widths,
      bufferRows: props.bufferRows,
      bufferCols: props.bufferCols,
    });
  } else {
    renderManager.updateColumnWidths(widths);
  }
  currentWidths = widths;
  updateRanges();
};

const updateRanges = () => {
  ranges.value = renderManager.getRanges(state.viewportWidth, state.viewportHeight, state.scrollLeft, state.scrollTop);
  props.dataManager.ensureRange(ranges.value.rowRange.start, ranges.value.rowRange.end);
};

const rafState = reactive({ scrollRaf: 0 });
const scheduleScrollUpdate = () => {
  if (rafState.scrollRaf) return;
  rafState.scrollRaf = requestAnimationFrame(() => {
    if (headerRef.value) headerRef.value.scrollLeft = state.scrollLeft;
    updateRanges();
    rafState.scrollRaf = 0;
  });
};

const resizeObserver = new ResizeObserver((entries) => {
  const entry = entries[0];
  if (!entry) return;
  state.viewportWidth = entry.contentRect.width;
  state.viewportHeight = entry.contentRect.height - headerHeight;
  updateRanges();
});

const onScroll = (event: Event) => {
  const target = event.target as HTMLDivElement;
  state.scrollLeft = target.scrollLeft;
  state.scrollTop = target.scrollTop;
  scheduleScrollUpdate();
};

const selection = reactive({
  selecting: false,
  startRow: 0,
  startCol: 0,
  endRow: 0,
  endCol: 0,
  hasSelection: false,
});

const setSelection = (startRow: number, startCol: number, endRow: number, endCol: number) => {
  selection.startRow = startRow;
  selection.startCol = startCol;
  selection.endRow = endRow;
  selection.endCol = endCol;
  selection.hasSelection = true;
};

const selectionBounds = computed(() => ({
  rowMin: Math.min(selection.startRow, selection.endRow),
  rowMax: Math.max(selection.startRow, selection.endRow),
  colMin: Math.min(selection.startCol, selection.endCol),
  colMax: Math.max(selection.startCol, selection.endCol),
}));

const cellClass = (row: number, col: number) => {
  if (!selection.hasSelection) return '';
  const { rowMin, rowMax, colMin, colMax } = selectionBounds.value;
  return row >= rowMin && row <= rowMax && col >= colMin && col <= colMax ? 'is-selected' : '';
};

const resolveCellTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  const cell = element?.closest('.div-table__cell') as HTMLElement | null;
  if (!cell) return null;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  if (Number.isNaN(row) || Number.isNaN(col)) return null;
  return { row, col };
};

const onBodyPointerDown = (event: PointerEvent) => {
  const point = resolveCellTarget(event.target);
  if (!point) return;
  selection.selecting = true;
  setSelection(point.row, point.col, point.row, point.col);
};

const onBodyPointerMove = (event: PointerEvent) => {
  if (!selection.selecting) return;
  const point = resolveCellTarget(event.target);
  if (!point) return;
  selection.endRow = point.row;
  selection.endCol = point.col;
};

const stopSelection = () => {
  selection.selecting = false;
};

const selectColumn = (columnIndex: number) => {
  setSelection(0, columnIndex, props.rowCount - 1, columnIndex);
};

const editing = reactive({ row: -1, col: -1, value: '' });
const getCellValue = (row: number, colIndex: number) => props.dataManager.getRow(row)[colIndex] ?? '';
const isEditing = (row: number, col: number) => editing.row === row && editing.col === col;

const startEditing = (row: number, col: number) => {
  editing.row = row;
  editing.col = col;
  editing.value = getCellValue(row, col);
  nextTick(() => {
    const input = bodyRef.value?.querySelector<HTMLInputElement>('.div-table__cell-input');
    input?.focus();
    input?.select();
  });
};

const onEditInput = (event: Event) => {
  editing.value = (event.target as HTMLInputElement).value;
};

const commitEdit = () => {
  if (editing.row < 0 || editing.col < 0) return;
  props.dataManager.updateCell(editing.row, editing.col, editing.value);
  editing.row = -1;
  editing.col = -1;
  editing.value = '';
};

const renameState = reactive({ index: -1, value: '' });
const startRename = (col: ManagedColumn) => {
  renameState.index = col.index;
  renameState.value = col.label;
  nextTick(() => {
    const input = headerRef.value?.querySelector<HTMLInputElement>('.div-table__rename-input');
    input?.focus();
    input?.select();
  });
};
const onRenameInput = (event: Event) => {
  renameState.value = (event.target as HTMLInputElement).value;
};
const commitRename = () => {
  if (renameState.index < 0) return;
  columnManager.renameColumn(renameState.index, renameState.value);
  renameState.index = -1;
  renameState.value = '';
  syncColumns();
};
const cancelRename = () => {
  renameState.index = -1;
  renameState.value = '';
};

const resizeState = reactive({ active: false, startX: 0, startWidth: 0, colIndex: -1 });
const startResize = (event: PointerEvent, colIndex: number) => {
  const col = allColumns.value.find((item) => item.index === colIndex);
  if (!col) return;
  resizeState.active = true;
  resizeState.startX = event.clientX;
  resizeState.startWidth = col.width;
  resizeState.colIndex = colIndex;
};

const dragState = reactive({
  active: false,
  fromPosition: -1,
  toPosition: -1,
});

const startDrag = (event: PointerEvent, position: number) => {
  event.preventDefault();
  dragState.active = true;
  dragState.fromPosition = position;
  dragState.toPosition = position;
};

const dragIndicatorStyle = computed(() => {
  if (!dragState.active || dragState.toPosition < 0) return { opacity: '0' };
  const offsets = ranges.value.colOffsets;
  const base = offsets[colRange.value.start] ?? 0;
  const visibleOffset = offsets[dragState.toPosition] ?? 0;
  return {
    opacity: '1',
    transform: `translateX(${visibleOffset - base}px)`,
  };
});

const onPointerMove = (event: PointerEvent) => {
  if (resizeState.active) {
    const nextWidth = resizeState.startWidth + (event.clientX - resizeState.startX);
    columnManager.resizeColumn(resizeState.colIndex, nextWidth);
    syncColumns();
    return;
  }
  if (!dragState.active) return;
  const headerBounds = headerRef.value?.getBoundingClientRect();
  if (!headerBounds) return;
  const relativeX = event.clientX - headerBounds.left + state.scrollLeft;
  const offsets = ranges.value.colOffsets;
  const cols = visibleColumnsAll.value;
  let target = Math.max(cols.length - 1, 0);
  for (let i = 0; i < cols.length; i += 1) {
    if (relativeX < offsets[i] + cols[i].width / 2) {
      target = i;
      break;
    }
  }
  dragState.toPosition = target;
};

const stopResize = () => {
  resizeState.active = false;
};

const stopDrag = () => {
  if (!dragState.active) return;
  columnManager.reorderColumnByPosition(dragState.fromPosition, dragState.toPosition);
  dragState.active = false;
  dragState.fromPosition = -1;
  dragState.toPosition = -1;
  syncColumns();
};

const headerInnerStyle = computed(() => ({
  width: `${totalWidth.value}px`,
  transform: `translateX(${colRange.value.offset}px)`,
}));

const gridStyle = computed(() => ({
  transform: `translate(${colRange.value.offset}px, ${rowRange.value.offset}px)`,
}));

const headerCellClass = (colIndex: number) => {
  if (!selection.hasSelection) return '';
  return selectionBounds.value.colMin === colIndex && selectionBounds.value.colMax === colIndex ? 'is-column-selected' : '';
};

const toFlexAlign = (align: ManagedColumn['align']) => {
  if (align === 'center') return 'center';
  if (align === 'right') return 'flex-end';
  return 'flex-start';
};

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

onMounted(() => {
  if (wrapperRef.value) resizeObserver.observe(wrapperRef.value);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopResize);
  window.addEventListener('pointerup', stopDrag);
  window.addEventListener('pointerup', stopSelection);
  updateRanges();
});

onBeforeUnmount(() => {
  resizeObserver.disconnect();
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', stopResize);
  window.removeEventListener('pointerup', stopDrag);
  window.removeEventListener('pointerup', stopSelection);
  if (rafState.scrollRaf) cancelAnimationFrame(rafState.scrollRaf);
});

watch(
  () => props.columns,
  (next) => {
    columnManager.setColumns(next);
    syncColumns();
  },
);
</script>

<style scoped>
.div-table { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff; display: flex; flex-direction: column; height: 600px; }
.div-table__header { overflow: hidden; border-bottom: 1px solid #e2e8f0; background: #f1f5f9; position: relative; }
.div-table__header-inner { display: flex; height: 40px; position: relative; }
.div-table__header-cell { position: relative; display: flex; align-items: center; border-right: 1px solid #e2e8f0; user-select: none; transition: transform 0.16s ease, opacity 0.16s ease, box-shadow 0.16s ease; }
.div-table__header-cell:hover .div-table__drag-handle,
.div-table__header-cell:hover .div-table__resize-handle { opacity: 1; }
.div-table__header-center { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: inherit; padding: 0 4px; cursor: pointer; }
.div-table__header-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: #1e293b; }
.div-table__drag-handle,
.div-table__resize-handle { width: 18px; height: 100%; border: 0; background: transparent; color: #64748b; opacity: 0; cursor: grab; transition: opacity 0.15s ease; }
.div-table__resize-handle { cursor: col-resize; }
.div-table__rename-input { width: 100%; height: 26px; border: 1px solid #60a5fa; border-radius: 4px; padding: 0 6px; }
.div-table__drag-indicator { position: absolute; top: 0; height: 40px; width: 2px; background: #3b82f6; pointer-events: none; transition: transform 0.1s ease; }
.div-table__body { flex: 1; overflow: auto; position: relative; font-size: 13px; }
.div-table__spacer, .div-table__grid { position: absolute; top: 0; left: 0; }
.div-table__row { display: flex; }
.div-table__cell { border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 0 8px; display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #fff; }
.div-table__cell.is-selected { background: #dbeafe; }
.div-table__header-cell.is-column-selected { background: #dbeafe; }
.div-table__cell-input { width: 100%; height: 28px; border: 1px solid #60a5fa; border-radius: 6px; padding: 0 6px; outline: none; }
</style>
