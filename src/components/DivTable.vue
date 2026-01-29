<template>
  <div class="div-table" ref="wrapperRef">
    <div class="div-table__header" ref="headerRef">
      <div
        class="div-table__header-inner"
        :style="{
          width: `${totalWidth}px`,
          transform: `translateX(${colRange.offset}px)`,
        }"
      >
        <div
          v-for="col in visibleCols"
          :key="col.key"
          class="div-table__header-cell"
          :style="headerCellStyle(col)"
          @pointerdown="onHeaderPointerDown($event, col)"
        >
          <slot name="header" :column="col">
            <span class="div-table__header-label">{{ col.label }}</span>
          </slot>
          <span
            class="div-table__resize-handle"
            @pointerdown.stop="onResizeStart($event, col)"
          ></span>
        </div>
      </div>
    </div>

    <div
      class="div-table__body"
      ref="bodyRef"
      @scroll="onScroll"
      @pointerdown="onBodyPointerDown"
      @pointermove="onBodyPointerMove"
    >
      <div
        class="div-table__spacer"
        :style="{ width: `${totalWidth}px`, height: `${totalHeight}px` }"
      ></div>
      <div
        class="div-table__grid"
        :style="{
          transform: `translate(${colRange.offset}px, ${rowRange.offset}px)`,
        }"
      >
        <div
          v-for="row in visibleRows"
          :key="row"
          class="div-table__row"
          :style="{ height: `${rowHeight}px` }"
        >
          <div
            v-for="col in visibleCols"
            :key="col.key"
            class="div-table__cell"
            :data-row="row"
            :data-col="col.index"
            :style="cellStyle(col)"
            :class="cellClass(row, col.index)"
            @dblclick="startEditing(row, col.index)"
          >
            <input
              v-if="isEditing(row, col.index)"
              class="div-table__cell-input"
              :value="editingValue"
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
import { createRenderManager } from '../utils/renderManager';

export interface ColumnDef {
  key: string;
  label: string;
  width: number;
  style?: Record<string, string>;
}

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

const state = reactive({
  viewportWidth: 0,
  viewportHeight: 0,
  scrollLeft: 0,
  scrollTop: 0,
});

const columns = ref(props.columns.map((col, index) => ({ ...col, index })));

const headerHeight = 40;

const renderManager = createRenderManager({
  rowCount: props.rowCount,
  colCount: columns.value.length,
  rowHeight: props.rowHeight,
  colWidths: columns.value.map((col) => col.width),
  bufferRows: props.bufferRows,
  bufferCols: props.bufferCols,
});

const ranges = ref(renderManager.getRanges(0, 0, 0, 0));

const updateRanges = () => {
  ranges.value = renderManager.getRanges(
    state.viewportWidth,
    state.viewportHeight,
    state.scrollLeft,
    state.scrollTop,
  );
  props.dataManager.ensureRange(ranges.value.rowRange.start, ranges.value.rowRange.end);
};

const resizeObserver = new ResizeObserver((entries) => {
  const entry = entries[0];
  if (!entry) return;
  const { width, height } = entry.contentRect;
  state.viewportWidth = width;
  state.viewportHeight = height - headerHeight;
  updateRanges();
});

const visibleRows = computed(() => {
  const { start, end } = ranges.value.rowRange;
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
});

const visibleCols = computed(() => {
  const { start, end } = ranges.value.colRange;
  return columns.value.slice(start, end + 1);
});

const totalWidth = computed(() => ranges.value.totalWidth);
const totalHeight = computed(() => ranges.value.totalHeight);
const rowRange = computed(() => ranges.value.rowRange);
const colRange = computed(() => ranges.value.colRange);

const headerCellStyle = (col: ColumnDef & { index: number }) => ({
  width: `${col.width}px`,
  ...col.style,
});

const cellStyle = (col: ColumnDef & { index: number }) => ({
  width: `${col.width}px`,
});

const getCellValue = (row: number, colIndex: number) => {
  const rowData = props.dataManager.getRow(row);
  return rowData[colIndex] ?? '';
};

const rafState = reactive({
  scrollRaf: 0,
});

const scheduleScrollUpdate = () => {
  if (rafState.scrollRaf) return;
  rafState.scrollRaf = requestAnimationFrame(() => {
    if (headerRef.value) {
      headerRef.value.scrollLeft = state.scrollLeft;
    }
    updateRanges();
    rafState.scrollRaf = 0;
  });
};

const onScroll = (event: Event) => {
  const target = event.target as HTMLDivElement;
  state.scrollLeft = target.scrollLeft;
  state.scrollTop = target.scrollTop;
  scheduleScrollUpdate();
};

const selection = reactive({
  active: false,
  startRow: 0,
  startCol: 0,
  endRow: 0,
  endCol: 0,
});

const cellClass = (row: number, col: number) => {
  if (!selection.active) return '';
  const rowMin = Math.min(selection.startRow, selection.endRow);
  const rowMax = Math.max(selection.startRow, selection.endRow);
  const colMin = Math.min(selection.startCol, selection.endCol);
  const colMax = Math.max(selection.startCol, selection.endCol);
  if (row >= rowMin && row <= rowMax && col >= colMin && col <= colMax) {
    return 'is-selected';
  }
  return '';
};

const onBodyPointerDown = (event: PointerEvent) => {
  const target = event.target as HTMLElement;
  if (!target.dataset.row || !target.dataset.col) return;
  selection.active = true;
  selection.startRow = Number(target.dataset.row);
  selection.startCol = Number(target.dataset.col);
  selection.endRow = selection.startRow;
  selection.endCol = selection.startCol;
};

const onBodyPointerMove = (event: PointerEvent) => {
  if (!selection.active) return;
  const target = event.target as HTMLElement;
  if (!target.dataset.row || !target.dataset.col) return;
  selection.endRow = Number(target.dataset.row);
  selection.endCol = Number(target.dataset.col);
};

const stopSelection = () => {
  selection.active = false;
};

const editing = reactive({
  row: -1,
  col: -1,
  value: '',
});

const editingValue = computed(() => editing.value);

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

const isEditing = (row: number, col: number) => editing.row === row && editing.col === col;

const onEditInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  editing.value = target.value;
};

const commitEdit = () => {
  if (editing.row < 0 || editing.col < 0) return;
  props.dataManager.updateCell(editing.row, editing.col, editing.value);
  editing.row = -1;
  editing.col = -1;
  editing.value = '';
};

const resizeState = reactive({
  active: false,
  startX: 0,
  startWidth: 0,
  colIndex: -1,
});

const onResizeStart = (event: PointerEvent, col: ColumnDef & { index: number }) => {
  resizeState.active = true;
  resizeState.startX = event.clientX;
  resizeState.startWidth = col.width;
  resizeState.colIndex = col.index;
};

const onHeaderPointerDown = (event: PointerEvent, col: ColumnDef & { index: number }) => {
  dragState.active = true;
  dragState.startX = event.clientX;
  dragState.colIndex = col.index;
  dragState.targetPosition = columns.value.findIndex((item) => item.index === col.index);
};

const dragState = reactive({
  active: false,
  startX: 0,
  colIndex: -1,
  targetPosition: undefined as number | undefined,
});

const onPointerMove = (event: PointerEvent) => {
  if (resizeState.active) {
    const delta = event.clientX - resizeState.startX;
    const col = columns.value.find((c) => c.index === resizeState.colIndex);
    if (col) {
      col.width = Math.max(60, resizeState.startWidth + delta);
      renderManager.updateColumnWidths(columns.value.map((c) => c.width));
      updateRanges();
    }
  }

  if (dragState.active) {
    const headerBounds = headerRef.value?.getBoundingClientRect();
    if (!headerBounds) return;
    const relativeX = event.clientX - headerBounds.left + state.scrollLeft;
    const offsets = ranges.value.colOffsets;
    let target = offsets.length - 1;
    for (let i = 0; i < offsets.length; i += 1) {
      if (relativeX < offsets[i] + columns.value[i].width / 2) {
        target = i;
        break;
      }
    }
    dragState.targetPosition = target;
  }
};

const stopResize = () => {
  resizeState.active = false;
};

const stopDrag = () => {
  if (!dragState.active) return;
  const fromIndex = dragState.colIndex;
  const fromPosition = columns.value.findIndex((c) => c.index === fromIndex);
  const toPosition = dragState.targetPosition ?? fromPosition;
  if (fromPosition !== -1 && toPosition !== -1 && fromPosition !== toPosition) {
    const next = [...columns.value];
    const [moved] = next.splice(fromPosition, 1);
    next.splice(toPosition, 0, moved);
    columns.value = next;
    renderManager.updateColumnWidths(next.map((c) => c.width));
    updateRanges();
  }
  dragState.active = false;
  dragState.colIndex = -1;
  dragState.targetPosition = undefined;
};

onMounted(() => {
  if (wrapperRef.value) {
    resizeObserver.observe(wrapperRef.value);
  }
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
  if (rafState.scrollRaf) {
    cancelAnimationFrame(rafState.scrollRaf);
    rafState.scrollRaf = 0;
  }
});

watch(
  () => props.columns,
  (next) => {
    columns.value = next.map((col, index) => ({ ...col, index }));
    renderManager.updateColumnWidths(columns.value.map((col) => col.width));
    updateRanges();
  },
);
</script>

<style scoped>
.div-table {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  display: flex;
  flex-direction: column;
  height: 600px;
}

.div-table__header {
  overflow: hidden;
  border-bottom: 1px solid #e2e8f0;
  background: #f1f5f9;
}

.div-table__header-inner {
  display: flex;
  height: 40px;
  position: relative;
}

.div-table__header-cell {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 8px;
  border-right: 1px solid #e2e8f0;
  font-weight: 600;
  color: #1e293b;
  user-select: none;
}

.div-table__header-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.div-table__resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
}

.div-table__body {
  flex: 1;
  overflow: auto;
  position: relative;
  font-size: 13px;
}

.div-table__spacer {
  position: absolute;
  top: 0;
  left: 0;
}

.div-table__grid {
  position: absolute;
  top: 0;
  left: 0;
}

.div-table__row {
  display: flex;
}

.div-table__cell {
  border-right: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
  padding: 0 8px;
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: #fff;
}

.div-table__cell.is-selected {
  background: #dbeafe;
}

.div-table__cell-input {
  width: 100%;
  height: 28px;
  border: 1px solid #60a5fa;
  border-radius: 6px;
  padding: 0 6px;
  outline: none;
}
</style>
