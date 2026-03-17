<template>
  <div class="div-table" ref="wrapperRef" :data-table-name="tableName" :data-style-scope="styleScopeId">
    <div class="div-table__header">
      <div class="div-table__row-index-header"></div>
      <div class="div-table__header-scroll" ref="headerRef">
        <div class="div-table__header-inner">
        <div
          v-for="(col, position) in visibleCols"
          :key="col.key"
          class="div-table__header-cell"
          :class="[headerCellClass(col.index), getHeaderCellClasses(col, position)]"
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
      <div class="div-table__drag-indicator"></div>
    </div>

    <div class="div-table__body">
      <div
        class="div-table__row-index"
        ref="rowIndexRef"
        @contextmenu="onRowIndexContextMenu"
      >
        <div class="div-table__row-index-grid">
          <div
            v-for="row in visibleRows"
            :key="row"
            class="div-table__row-index-cell"
            :class="rowIndexClass(row)"
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
        <div class="div-table__spacer"></div>
        <div class="div-table__grid">
          <div v-for="row in visibleRows" :key="row" class="div-table__row">
            <div
              v-for="(col, position) in visibleCols"
              :key="col.key"
              class="div-table__cell"
              :data-row="row"
              :data-col="col.index"
              :class="[cellClass(row, col.index), getBodyCellClasses(col, position)]"
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
import { useColumnManager } from '../hooks/useColumnManager';
import { useEditing } from '../hooks/useEditing';
import { useSelect } from '../hooks/useSelect';
import { useTableViewport } from '../hooks/useTableViewport';
import type { DataManager } from '../utils/dataManager';
import { type ColumnAlign, type ColumnDef, type ManagedColumn } from '../utils/columnManager';
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
const headerHeight = 40;
const styleScopeId = `div-table-${Math.random().toString(36).slice(2, 10)}`;
const tableName = ref('');
const fontState = reactive({ family: '', size: 0 });
const rowHeightState = ref(props.rowHeight);
const rowIndexWidth = computed(() => {
  const digits = String(props.rowCount).length;
  return Math.max(48, digits * 8 + 16);
});

const {
  allColumns,
  visibleColumns,
  renameColumn: renameColumnByIndex,
  resizeColumn: resizeColumnByIndex,
  reorderColumnByPosition,
  setColumnVisible,
  setColumnAlign: setColumnAlignByIndex,
  setAllColumnsAlign,
} = useColumnManager({
  columns: toRef(props, 'columns'),
});

const getAlignClass = (align: ManagedColumn['align']) => `is-align-${align}`;
const getColumnWidthClass = (columnIndex: number) => `div-table__col-${columnIndex}`;
const getHeaderStyleClass = (columnIndex: number) => `div-table__header-col-${columnIndex}`;

const kebabCase = (input: string) => input.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

const serializeHeaderStyle = (style?: Record<string, string>) => {
  if (!style) return '';
  return Object.entries(style)
    .map(([key, value]) => `${kebabCase(key)}: ${value};`)
    .join(' ');
};

const columnDynamicStyleText = computed(() => {
  const rootSelector = `.div-table[data-style-scope="${styleScopeId}"]`;
  return allColumns.value
    .map((col) => {
      const widthRule = `${rootSelector} .${getColumnWidthClass(col.index)} { width: ${col.width}px; }`;
      const headerStyleText = serializeHeaderStyle(col.style);
      const headerRule = headerStyleText
        ? `${rootSelector} .${getHeaderStyleClass(col.index)} { ${headerStyleText} }`
        : '';
      return [widthRule, headerRule].filter(Boolean).join('\n');
    })
    .join('\n');
});

let dynamicColumnStyleEl: HTMLStyleElement | null = null;
const ensureDynamicColumnStyleEl = () => {
  if (typeof document === 'undefined') return null;
  if (dynamicColumnStyleEl) return dynamicColumnStyleEl;
  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-div-table-style-scope', styleScopeId);
  document.head.appendChild(styleEl);
  dynamicColumnStyleEl = styleEl;
  return dynamicColumnStyleEl;
};

const syncDynamicColumnStyles = () => {
  const styleEl = ensureDynamicColumnStyleEl();
  if (!styleEl) return;
  styleEl.textContent = columnDynamicStyleText.value;
};

const {
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
  updateRanges,
  mountViewport,
  unmountViewport,
  syncViewportFromWrapper,
  getCellValue,
  updateCell,
  refreshData: refreshTableData,
} = useTableViewport({
  rowCount: toRef(props, 'rowCount'),
  rowHeight: rowHeightState,
  bufferRows: toRef(props, 'bufferRows'),
  bufferCols: toRef(props, 'bufferCols'),
  rowIndexWidth,
  bodyRef,
  headerRef,
  wrapperRef,
  visibleColumns,
  dataManager: props.dataManager,
  headerHeight,
});

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
  updateCell,
  renameColumn: renameColumnByIndex,
});

const {
  dragState,
  startResize,
  startDrag,
  onGlobalPointerMove: onColumnPointerMove,
  stopResize,
  stopDrag,
  headerCellDragClass,
  cellDragClass,
} = useColumnInteractions({
  allColumns,
  visibleColumns,
  headerRef,
  scrollLeft: computed(() => state.scrollLeft),
  resizeColumn: resizeColumnByIndex,
  reorderColumns: reorderColumnByPosition,
});

const onPointerMove = (event: PointerEvent) => {
  if (onColumnPointerMove(event)) return;
  onSelectPointerMove(event);
};

const getHeaderCellClasses = (col: ManagedColumn, position: number) =>
  [getColumnWidthClass(col.index), getHeaderStyleClass(col.index), getAlignClass(col.align), headerCellDragClass(position)]
    .filter(Boolean)
    .join(' ');

const getBodyCellClasses = (col: ManagedColumn, position: number) =>
  [getColumnWidthClass(col.index), getAlignClass(col.align), cellDragClass(position)].filter(Boolean).join(' ');

const tableFontFamily = computed(() => fontState.family || 'inherit');
const tableFontSize = computed(() => (fontState.size > 0 ? `${fontState.size}px` : 'inherit'));
const rowIndexWidthPx = computed(() => `${rowIndexWidth.value}px`);
const headerInnerWidthPx = computed(() => `${totalWidth.value}px`);
const headerInnerOffsetPx = computed(() => `${colRange.value.offset}px`);
const dragIndicatorOpacity = computed(() => (dragState.active && dragState.toPosition >= 0 ? '1' : '0'));
const dragIndicatorOffsetPx = computed(() => {
  if (!dragState.active || dragState.toPosition < 0) return '0px';
  const offsets = ranges.value.colOffsets;
  const base = offsets[colRange.value.start] ?? 0;
  const visibleOffset = offsets[dragState.toPosition] ?? 0;
  return `${visibleOffset - base + rowIndexWidth.value}px`;
});
const rowIndexBottomPx = computed(() => `${scrollbarState.horizontal}px`);
const rowIndexGridOffsetPx = computed(() => `${rowRange.value.offset - state.scrollTop}px`);
const spacerWidthPx = computed(() => `${contentWidth.value}px`);
const spacerHeightPx = computed(() => `${totalHeight.value}px`);
const gridOffsetXPx = computed(() => `${colRange.value.offset + rowIndexWidth.value}px`);
const gridOffsetYPx = computed(() => `${rowRange.value.offset}px`);
const rowHeightPx = computed(() => `${rowHeightState.value}px`);

const renameTable = (name: string) => {
  tableName.value = name?.toString().trim() ?? '';
};

const refreshData = () => {
  refreshTableData();
  updateRanges();
};

const setColumnWidth = (columnIndex: number, width: number) => {
  resizeColumnByIndex(columnIndex, width);
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
  setAllColumnsAlign(align);
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
  renameColumnByIndex(columnIndex, label);
};

const changeColumnVisible = (columnIndex: number, visible: boolean) => {
  setColumnVisible(columnIndex, visible);
};

const locateColumn = (columnIndex: number) => {
  const visible = visibleColumns.value;
  const position = visible.findIndex((col) => col.index === columnIndex);
  if (position < 0) return;
  const { offsets } = buildColumnOffsets(visible.map((col) => col.width));
  const offset = offsets[position] ?? 0;
  applyScrollOffset(offset, undefined);
};

const setColumnAlign = (columnIndex: number, align: ColumnAlign) => {
  setColumnAlignByIndex(columnIndex, align);
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

watch(
  columnDynamicStyleText,
  () => {
    syncDynamicColumnStyles();
  },
  { immediate: true },
);

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
  dynamicColumnStyleEl?.remove();
  dynamicColumnStyleEl = null;
});

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

watch(
  () => [props.bufferRows, props.bufferCols],
  () => {
    rebuildRenderManager();
    updateRanges();
  },
);
</script>

<style scoped>
.div-table { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff; display: flex; flex-direction: column; height: 600px; font-family: v-bind(tableFontFamily); font-size: v-bind(tableFontSize); }
.div-table__header { overflow: hidden; border-bottom: 1px solid #e2e8f0; background: #f1f5f9; position: relative; display: flex; height: 40px; }
.div-table__row-index-header { flex: 0 0 auto; height: 100%; border-right: 1px solid #e2e8f0; background: #f8fafc; width: v-bind(rowIndexWidthPx); }
.div-table__header-scroll { flex: 1; overflow: hidden; height: 100%; position: relative; }
.div-table__header-inner { display: flex; height: 40px; position: relative; width: v-bind(headerInnerWidthPx); transform: translateX(v-bind(headerInnerOffsetPx)); }
.div-table__header-cell { position: relative; display: flex; align-items: center; border-right: 1px solid #e2e8f0; user-select: none; transition: transform 0.16s ease, opacity 0.16s ease, box-shadow 0.16s ease; }
.div-table__header-cell.is-dragging { transform: scale(0.98); opacity: 0.6; }
.div-table__header-cell:hover .div-table__drag-handle,
.div-table__header-cell:hover .div-table__resize-handle { opacity: 1; }
.div-table__header-center { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: inherit; padding: 0 4px; cursor: pointer; }
.div-table__header-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: #1e293b; }
.div-table__drag-handle,
.div-table__resize-handle { width: 18px; height: 100%; border: 0; background: transparent; color: #64748b; opacity: 0; cursor: grab; transition: opacity 0.15s ease; }
.div-table__resize-handle { cursor: col-resize; }
.div-table__rename-input { width: 100%; height: 26px; border: 1px solid #60a5fa; border-radius: 4px; padding: 0 6px; }
.div-table__drag-indicator { position: absolute; top: 0; height: 40px; width: 2px; background: #3b82f6; pointer-events: none; transition: transform 0.1s ease; opacity: v-bind(dragIndicatorOpacity); transform: translateX(v-bind(dragIndicatorOffsetPx)); }
.div-table__body { flex: 1; position: relative; font-size: 13px; overflow: hidden; }
.div-table__scroll { width: 100%; height: 100%; overflow: auto; position: relative; min-width: 0; }
.div-table__scroll.is-selecting { user-select: none; }
.div-table__scroll.is-selecting .div-table__cell-input { user-select: text; }
.div-table__row-index { position: absolute; top: 0; left: 0; bottom: 0; z-index: 1; background: #f8fafc; border-right: 1px solid #e2e8f0; overflow: hidden; width: v-bind(rowIndexWidthPx); bottom: v-bind(rowIndexBottomPx); }
.div-table__row-index-grid { position: absolute; top: 0; left: 0; right: 0; transform: translateY(v-bind(rowIndexGridOffsetPx)); }
.div-table__row-index-cell { display: flex; align-items: center; justify-content: flex-end; padding: 0 8px; color: #475569; border-bottom: 1px solid #e2e8f0; font-variant-numeric: tabular-nums; cursor: pointer; user-select: none; background: #f8fafc; height: v-bind(rowHeightPx); }
.div-table__row-index-cell.is-row-selected { background: #e0f2fe; color: #0f172a; }
.div-table__spacer, .div-table__grid { position: absolute; top: 0; left: 0; }
.div-table__spacer { width: v-bind(spacerWidthPx); height: v-bind(spacerHeightPx); }
.div-table__grid { transform: translate(v-bind(gridOffsetXPx), v-bind(gridOffsetYPx)); }
.div-table__row { display: flex; height: v-bind(rowHeightPx); }
.div-table__cell { border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 0 8px; display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: #fff; }
.div-table__cell.is-drag-target { box-shadow: inset 2px 0 0 #3b82f6; }
.div-table__cell.is-row-selected { background: #e0f2fe; }
.div-table__cell.is-selected { background: #dbeafe; }
.div-table__header-cell.is-column-selected { background: #dbeafe; }
.div-table__header-cell.is-align-left, .div-table__cell.is-align-left { justify-content: flex-start; }
.div-table__header-cell.is-align-center, .div-table__cell.is-align-center { justify-content: center; }
.div-table__header-cell.is-align-right, .div-table__cell.is-align-right { justify-content: flex-end; }
.div-table__cell-input { width: 100%; height: 28px; border: 1px solid #60a5fa; border-radius: 6px; padding: 0 6px; outline: none; }
</style>
