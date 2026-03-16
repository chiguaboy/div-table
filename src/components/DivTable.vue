<template>
  <div class="div-table" ref="wrapperRef" :style="tableStyle" :data-table-name="tableName">
    <div class="div-table__header">
      <div class="div-table__row-index-header" :style="{ width: `${rowIndexWidth}px` }"></div>
      <div class="div-table__header-scroll" ref="headerRef">
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
      </div>
      <div class="div-table__drag-indicator" :style="dragIndicatorStyle"></div>
    </div>

    <div class="div-table__body">
      <div
        class="div-table__row-index"
        ref="rowIndexRef"
        :style="{ width: `${rowIndexWidth}px`, bottom: `${scrollbarState.horizontal}px` }"
        @contextmenu="onRowIndexContextMenu"
      >
        <div class="div-table__row-index-grid" :style="rowIndexGridStyle">
          <div
            v-for="row in visibleRows"
            :key="row"
            class="div-table__row-index-cell"
            :class="rowIndexClass(row)"
            :style="{ height: `${rowHeightState}px` }"
            @pointerdown.stop="onRowIndexPointerDown(row, $event)"
          >
            {{ row + 1 }}
          </div>
        </div>
      </div>
      <div
        class="div-table__scroll"
        ref="bodyRef"
        :class="{ 'is-selecting': selection.selecting }"
        @scroll="onScroll"
        @pointerdown="onBodyPointerDown"
        @pointermove="onBodyPointerMove"
      >
        <div class="div-table__spacer" :style="{ width: `${contentWidth}px`, height: `${totalHeight}px` }"></div>
        <div class="div-table__grid" :style="gridStyle">
          <div v-for="row in visibleRows" :key="row" class="div-table__row" :style="{ height: `${rowHeightState}px` }">
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
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, toRef, watch } from 'vue';
import { useColumnInteractions } from '../hooks/useColumnInteractions';
import { useEditing } from '../hooks/useEditing';
import { useSelect } from '../hooks/useSelect';
import { useTableViewport } from '../hooks/useTableViewport';
import type { DataManager } from '../utils/dataManager';
import { createColumnManager, type ColumnAlign, type ColumnDef } from '../utils/columnManager';
import { buildColumnOffsets } from '../utils/renderManager';

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
const rowIndexRef = ref<HTMLDivElement | null>(null);
const dataVersion = ref(0);
const headerHeight = 40;
const tableName = ref('');
const fontState = reactive({ family: '', size: 0 });
const tableStyle = computed(() => {
  const style: Record<string, string> = {};
  if (fontState.family) style.fontFamily = fontState.family;
  if (fontState.size > 0) style.fontSize = `${fontState.size}px`;
  return style;
});
const rowHeightState = ref(props.rowHeight);
const rowIndexWidth = computed(() => {
  const digits = String(props.rowCount).length;
  return Math.max(48, digits * 8 + 16);
});

const columnManager = createColumnManager(props.columns);
const allColumns = ref(columnManager.getColumns().slice());

const {
  state,
  scrollbarState,
  ranges,
  visibleColumnsAll,
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
} = useTableViewport({
  rowCount: toRef(props, 'rowCount'),
  rowHeight: rowHeightState,
  bufferRows: toRef(props, 'bufferRows'),
  bufferCols: toRef(props, 'bufferCols'),
  rowIndexWidth,
  bodyRef,
  headerRef,
  wrapperRef,
  allColumns,
  dataManager: props.dataManager,
  onDataUpdated: () => {
    dataVersion.value += 1;
  },
  headerHeight,
});

const syncColumns = () => {
  allColumns.value = columnManager.getColumns().slice();
  syncColumnWidths(columnManager.getColumnWidths());
};

const {
  selection,
  cellClass,
  rowIndexClass,
  headerCellClass,
  onBodyPointerDown,
  onBodyPointerMove,
  onRowIndexPointerDown,
  onRowIndexContextMenu,
  onGlobalPointerMove: onSelectPointerMove,
  stopSelection,
  stopRowIndexSelection,
  selectColumn,
  setSelectedRows,
  matchRow,
  reserveMatchRow,
} = useSelect({
  rowCount: toRef(props, 'rowCount'),
  rowHeight: rowHeightState,
  rowIndexRef,
  scrollTop: computed(() => state.scrollTop),
});

const getCellValue = (row: number, colIndex: number) => {
  dataVersion.value;
  return props.dataManager.getRow(row)[colIndex] ?? '';
};

const {
  editing,
  renameState,
  isEditing,
  startEditing,
  onEditInput,
  commitEdit,
  startRename,
  onRenameInput,
  commitRename,
  cancelRename,
} = useEditing({
  bodyRef,
  headerRef,
  getCellValue,
  updateCell: (row, col, value) => {
    props.dataManager.updateCell(row, col, value);
  },
  renameColumn: (columnIndex, label) => {
    columnManager.renameColumn(columnIndex, label);
  },
  onRenamed: syncColumns,
});

const {
  startResize,
  startDrag,
  onGlobalPointerMove: onColumnPointerMove,
  stopResize,
  stopDrag,
  dragIndicatorStyle,
  headerCellStyle,
  cellStyle,
} = useColumnInteractions({
  allColumns,
  visibleColumns: visibleColumnsAll,
  ranges,
  colRangeStart: computed(() => colRange.value.start),
  rowIndexWidth,
  headerRef,
  scrollLeft: computed(() => state.scrollLeft),
  resizeColumn: (columnIndex, width) => {
    columnManager.resizeColumn(columnIndex, width);
  },
  reorderColumns: (fromPosition, toPosition) => {
    columnManager.reorderColumnByPosition(fromPosition, toPosition);
  },
  syncColumns,
});

const onPointerMove = (event: PointerEvent) => {
  if (onColumnPointerMove(event)) return;
  onSelectPointerMove(event);
};

const headerInnerStyle = computed(() => ({
  width: `${totalWidth.value}px`,
  transform: `translateX(${colRange.value.offset}px)`,
}));

const gridStyle = computed(() => ({
  transform: `translate(${colRange.value.offset + rowIndexWidth.value}px, ${rowRange.value.offset}px)`,
}));

const rowIndexGridStyle = computed(() => ({
  transform: `translateY(${rowRange.value.offset - state.scrollTop}px)`,
}));

const renameTable = (name: string) => {
  tableName.value = name?.toString().trim() ?? '';
};

const refreshData = () => {
  props.dataManager.refresh();
  updateRanges();
};

const setColumnWidth = (columnIndex: number, width: number) => {
  columnManager.resizeColumn(columnIndex, width);
  syncColumns();
};

const setRowHeight = (height: number) => {
  if (!Number.isFinite(height) || height <= 0) return;
  rowHeightState.value = height;
  rebuildRenderManager();
  updateRanges();
};

const setFont = (family: string, size?: number) => {
  if (typeof family === 'string') fontState.family = family;
  if (typeof size === 'number') fontState.size = size;
};

const setAlign = (align: ColumnAlign) => {
  allColumns.value.forEach((col) => columnManager.setColumnAlign(col.index, align));
  syncColumns();
};

const setScrollOffset = (
  leftOrOffset: number | { left?: number; top?: number; scrollLeft?: number; scrollTop?: number },
  top?: number,
) => {
  if (typeof leftOrOffset === 'number') {
    applyScrollOffset(leftOrOffset, top);
    return;
  }
  if (leftOrOffset && typeof leftOrOffset === 'object') {
    const left = 'left' in leftOrOffset ? leftOrOffset.left : (leftOrOffset as { scrollLeft?: number }).scrollLeft;
    const nextTop = 'top' in leftOrOffset ? leftOrOffset.top : (leftOrOffset as { scrollTop?: number }).scrollTop;
    applyScrollOffset(left, nextTop);
  }
};

const renameColumn = (columnIndex: number, label: string) => {
  columnManager.renameColumn(columnIndex, label);
  syncColumns();
};

const changeColumnVisible = (columnIndex: number, visible: boolean) => {
  columnManager.setColumnVisible(columnIndex, visible);
  syncColumns();
};

const locateColumn = (columnIndex: number) => {
  const visible = visibleColumnsAll.value;
  const position = visible.findIndex((col) => col.index === columnIndex);
  if (position < 0) return;
  const { offsets } = buildColumnOffsets(visible.map((col) => col.width));
  const offset = offsets[position] ?? 0;
  applyScrollOffset(offset, undefined);
};

const setColumnAlign = (columnIndex: number, align: ColumnAlign) => {
  columnManager.setColumnAlign(columnIndex, align);
  syncColumns();
};

defineExpose({
  renameTable,
  refreshData,
  setColumnWidth,
  setRowHeight,
  setFont,
  setAlign,
  setScrollOffset,
  renameColumn,
  changeColumnVisible,
  locateColumn,
  setColumnAlign,
  setSelectedRows,
  matchRow,
  reserveMatchRow,
});

onMounted(() => {
  mountViewport();
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopResize);
  window.addEventListener('pointerup', stopDrag);
  window.addEventListener('pointerup', stopSelection);
  window.addEventListener('pointerup', stopRowIndexSelection);
});

onBeforeUnmount(() => {
  unmountViewport();
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', stopResize);
  window.removeEventListener('pointerup', stopDrag);
  window.removeEventListener('pointerup', stopSelection);
  window.removeEventListener('pointerup', stopRowIndexSelection);
});

watch(
  () => props.columns,
  (next) => {
    columnManager.setColumns(next);
    syncColumns();
  },
);

watch(
  () => props.rowHeight,
  (next) => {
    if (next === rowHeightState.value) return;
    rowHeightState.value = next;
    rebuildRenderManager();
    updateRanges();
  },
);

watch(
  () => props.rowCount,
  () => {
    rebuildRenderManager();
    syncViewportFromWrapper();
    updateRanges();
  },
);
</script>

<style scoped>
.div-table { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff; display: flex; flex-direction: column; height: 600px; }
.div-table__header { overflow: hidden; border-bottom: 1px solid #e2e8f0; background: #f1f5f9; position: relative; display: flex; height: 40px; }
.div-table__row-index-header { flex: 0 0 auto; height: 100%; border-right: 1px solid #e2e8f0; background: #f8fafc; }
.div-table__header-scroll { flex: 1; overflow: hidden; height: 100%; position: relative; }
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
.div-table__body { flex: 1; position: relative; font-size: 13px; overflow: hidden; }
.div-table__scroll { width: 100%; height: 100%; overflow: auto; position: relative; min-width: 0; }
.div-table__scroll.is-selecting { user-select: none; }
.div-table__scroll.is-selecting .div-table__cell-input { user-select: text; }
.div-table__row-index { position: absolute; top: 0; left: 0; bottom: 0; z-index: 1; background: #f8fafc; border-right: 1px solid #e2e8f0; overflow: hidden; }
.div-table__row-index-grid { position: absolute; top: 0; left: 0; right: 0; }
.div-table__row-index-cell { display: flex; align-items: center; justify-content: flex-end; padding: 0 8px; color: #475569; border-bottom: 1px solid #e2e8f0; font-variant-numeric: tabular-nums; cursor: pointer; user-select: none; background: #f8fafc; }
.div-table__row-index-cell.is-row-selected { background: #e0f2fe; color: #0f172a; }
.div-table__spacer, .div-table__grid { position: absolute; top: 0; left: 0; }
.div-table__row { display: flex; }
.div-table__cell { border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 0 8px; display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #fff; }
.div-table__cell.is-row-selected { background: #e0f2fe; }
.div-table__cell.is-selected { background: #dbeafe; }
.div-table__header-cell.is-column-selected { background: #dbeafe; }
.div-table__cell-input { width: 100%; height: 28px; border: 1px solid #60a5fa; border-radius: 6px; padding: 0 6px; outline: none; }
</style>
