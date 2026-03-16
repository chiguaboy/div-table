import { computed, reactive, type Ref } from 'vue';

type RowSelectionMode = 'none' | 'include-range' | 'include-set' | 'exclude-set';

interface UseSelectOptions {
  rowCount: Readonly<Ref<number>>;
  rowHeight: Readonly<Ref<number>>;
  rowIndexRef: Ref<HTMLDivElement | null>;
  scrollTop: Readonly<Ref<number>>;
}

export const useSelect = ({ rowCount, rowHeight, rowIndexRef, scrollTop }: UseSelectOptions) => {
  const selection = reactive({
    selecting: false,
    startRow: 0,
    startCol: 0,
    endRow: 0,
    endCol: 0,
    hasSelection: false,
  });

  const rowSelection = reactive({
    mode: 'none' as RowSelectionMode,
    rows: new Set<number>(),
    rangeStart: -1,
    rangeEnd: -1,
    anchor: -1,
  });

  const rowIndexDragState = reactive({
    active: false,
    rangeStart: -1,
    lastRow: -1,
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

  const clearCellSelection = () => {
    selection.selecting = false;
    selection.hasSelection = false;
  };

  const clearRowSelection = () => {
    rowSelection.mode = 'none';
    rowSelection.rows = new Set();
    rowSelection.rangeStart = -1;
    rowSelection.rangeEnd = -1;
    rowSelection.anchor = -1;
  };

  const normalizeRowsInput = (input: number | number[]) => {
    const list = Array.isArray(input) ? input : [input];
    const maxRow = rowCount.value - 1;
    if (maxRow < 0) return [];
    const normalized: number[] = [];
    for (const row of list) {
      const base = Math.floor(row);
      if (Number.isNaN(base)) continue;
      normalized.push(Math.max(0, Math.min(maxRow, base)));
    }
    return normalized;
  };

  const setRowSelectionRange = (start: number, end: number) => {
    rowSelection.mode = 'include-range';
    rowSelection.rangeStart = start;
    rowSelection.rangeEnd = end;
    rowSelection.rows = new Set();
  };

  const setRowSelectionSet = (rows: number[], mode: 'include-set' | 'exclude-set') => {
    rowSelection.mode = mode;
    rowSelection.rows = new Set(rows);
    rowSelection.rangeStart = -1;
    rowSelection.rangeEnd = -1;
  };

  const setIncludedRows = (rows: number[], anchor = -1) => {
    if (rows.length === 0) {
      clearRowSelection();
      return;
    }
    const uniqueRows = Array.from(new Set(rows));
    if (uniqueRows.length === 1) {
      setRowSelectionRange(uniqueRows[0], uniqueRows[0]);
      rowSelection.anchor = anchor >= 0 ? anchor : uniqueRows[0];
      return;
    }
    setRowSelectionSet(uniqueRows, 'include-set');
    rowSelection.anchor = anchor >= 0 ? anchor : uniqueRows[0];
  };

  const buildIncludedRowsSet = () => {
    if (rowSelection.mode === 'include-set') {
      return new Set(rowSelection.rows);
    }
    if (rowSelection.mode !== 'include-range') {
      return new Set<number>();
    }
    if (rowSelection.rangeStart < 0 || rowSelection.rangeEnd < 0) {
      return new Set<number>();
    }
    const min = Math.min(rowSelection.rangeStart, rowSelection.rangeEnd);
    const max = Math.max(rowSelection.rangeStart, rowSelection.rangeEnd);
    const rows = new Set<number>();
    for (let row = min; row <= max; row += 1) {
      rows.add(row);
    }
    return rows;
  };

  const isRowMatched = (row: number) => {
    if (rowSelection.mode === 'include-range') {
      if (rowSelection.rangeStart < 0 || rowSelection.rangeEnd < 0) return false;
      const min = Math.min(rowSelection.rangeStart, rowSelection.rangeEnd);
      const max = Math.max(rowSelection.rangeStart, rowSelection.rangeEnd);
      return row >= min && row <= max;
    }
    if (rowSelection.mode === 'include-set') {
      return rowSelection.rows.has(row);
    }
    if (rowSelection.mode === 'exclude-set') {
      return !rowSelection.rows.has(row);
    }
    return false;
  };

  const cellClass = (row: number, col: number) => {
    const classes: string[] = [];
    if (selection.hasSelection) {
      const { rowMin, rowMax, colMin, colMax } = selectionBounds.value;
      if (row >= rowMin && row <= rowMax && col >= colMin && col <= colMax) {
        classes.push('is-selected');
      }
    }
    if (isRowMatched(row)) {
      classes.push('is-row-selected');
    }
    return classes.join(' ');
  };

  const rowIndexClass = (row: number) => (isRowMatched(row) ? 'is-row-selected' : '');

  const headerCellClass = (colIndex: number) => {
    if (!selection.hasSelection) return '';
    return selectionBounds.value.colMin === colIndex && selectionBounds.value.colMax === colIndex ? 'is-column-selected' : '';
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

  const isInteractiveTarget = (target: EventTarget | null) => {
    const element = target as HTMLElement | null;
    if (!element) return false;
    return Boolean(element.closest('input, textarea, select, button, [contenteditable="true"]'));
  };

  const onBodyPointerDown = (event: PointerEvent) => {
    if (isInteractiveTarget(event.target)) return;
    const point = resolveCellTarget(event.target);
    if (!point) return;
    event.preventDefault();
    clearRowSelection();
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

  const stopRowIndexSelection = () => {
    rowIndexDragState.active = false;
    rowIndexDragState.rangeStart = -1;
    rowIndexDragState.lastRow = -1;
  };

  const onRowIndexPointerDown = (row: number, event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    clearCellSelection();
    const appendMode = event.ctrlKey || event.metaKey;
    if (appendMode && !event.shiftKey) {
      const selectedRows = buildIncludedRowsSet();
      if (selectedRows.has(row)) {
        selectedRows.delete(row);
      } else {
        selectedRows.add(row);
      }
      setIncludedRows(Array.from(selectedRows), row);
      stopRowIndexSelection();
      return;
    }
    const rangeStart = event.shiftKey && rowSelection.anchor >= 0 ? rowSelection.anchor : row;
    setRowSelectionRange(rangeStart, row);
    if (!(event.shiftKey && rowSelection.anchor >= 0)) {
      rowSelection.anchor = row;
    }
    rowIndexDragState.active = true;
    rowIndexDragState.rangeStart = rangeStart;
    rowIndexDragState.lastRow = row;
  };

  const onRowIndexContextMenu = (event: MouseEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
  };

  const resolveRowByPointerY = (clientY: number) => {
    if (rowCount.value <= 0) return -1;
    const container = rowIndexRef.value;
    if (!container) return -1;
    const rect = container.getBoundingClientRect();
    if (!Number.isFinite(rowHeight.value) || rowHeight.value <= 0 || rect.height <= 0) return -1;
    const row = Math.floor((clientY - rect.top + scrollTop.value) / rowHeight.value);
    return Math.max(0, Math.min(rowCount.value - 1, row));
  };

  const onGlobalPointerMove = (event: PointerEvent) => {
    if (!rowIndexDragState.active) return false;
    const row = resolveRowByPointerY(event.clientY);
    if (row >= 0 && row !== rowIndexDragState.lastRow) {
      rowIndexDragState.lastRow = row;
      setRowSelectionRange(rowIndexDragState.rangeStart, row);
    }
    return true;
  };

  const selectColumn = (columnIndex: number) => {
    clearRowSelection();
    if (rowCount.value <= 0) {
      clearCellSelection();
      return;
    }
    setSelection(0, columnIndex, rowCount.value - 1, columnIndex);
  };

  const setSelectedRows = (rows: number | number[]) => {
    clearCellSelection();
    const normalized = normalizeRowsInput(rows);
    setIncludedRows(normalized, normalized[0] ?? -1);
  };

  const matchRow = (rows: number | number[]) => {
    setSelectedRows(rows);
  };

  const reserveMatchRow = (rows: number | number[]) => {
    clearCellSelection();
    const normalized = normalizeRowsInput(rows);
    setRowSelectionSet(normalized, 'exclude-set');
    rowSelection.anchor = normalized[0] ?? -1;
  };

  return {
    selection,
    cellClass,
    rowIndexClass,
    headerCellClass,
    onBodyPointerDown,
    onBodyPointerMove,
    onRowIndexPointerDown,
    onRowIndexContextMenu,
    onGlobalPointerMove,
    stopSelection,
    stopRowIndexSelection,
    selectColumn,
    setSelectedRows,
    matchRow,
    reserveMatchRow,
  };
};
