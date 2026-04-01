import { computed, reactive, type Ref } from 'vue';

type RowSelectionMode = 'none' | 'include-range' | 'include-set' | 'exclude-set';

interface UseSelectOptions {
  rowCount: Readonly<Ref<number>>;
  rowHeight: Readonly<Ref<number>>;
  rowIndexRef: Ref<HTMLDivElement | null>;
  scrollTop: Readonly<Ref<number>>;
}

interface SelectionRect {
  rowMin: number;
  rowMax: number;
  colMin: number;
  colMax: number;
}

interface RowRange {
  start: number;
  end: number;
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

  const selectionState = reactive({
    anchorRow: -1,
    anchorCol: -1,
    mergeMode: false,
  });

  const selectionRects = reactive<SelectionRect[]>([]);

  const rowSelection = reactive({
    mode: 'none' as RowSelectionMode,
    rows: new Set<number>(),
    rangeStart: -1,
    rangeEnd: -1,
    anchor: -1,
  });

  const setSelection = (startRow: number, startCol: number, endRow: number, endCol: number) => {
    selection.startRow = startRow;
    selection.startCol = startCol;
    selection.endRow = endRow;
    selection.endCol = endCol;
    selection.hasSelection = true;
  };

  const buildRect = (startRow: number, startCol: number, endRow: number, endCol: number): SelectionRect => ({
    rowMin: Math.min(startRow, endRow),
    rowMax: Math.max(startRow, endRow),
    colMin: Math.min(startCol, endCol),
    colMax: Math.max(startCol, endCol),
  });

  const activeSelectionRect = computed<SelectionRect | null>(() => {
    if (!selection.hasSelection) return null;
    return buildRect(selection.startRow, selection.startCol, selection.endRow, selection.endCol);
  });

  const effectiveSelectionRects = computed<SelectionRect[]>(() => {
    const active = activeSelectionRect.value;
    if (!active) return selectionRects.slice();
    if (!selection.selecting) return selectionRects.slice();
    if (selectionState.mergeMode) {
      return [...selectionRects, active];
    }
    return [active];
  });

  const rectContains = (rect: SelectionRect, row: number, col: number) =>
    row >= rect.rowMin && row <= rect.rowMax && col >= rect.colMin && col <= rect.colMax;

  const hasSelectedCell = (row: number, col: number) =>
    effectiveSelectionRects.value.some((rect) => rectContains(rect, row, col));

  const hasRowIndexSelected = (row: number) =>
    effectiveSelectionRects.value.some(
      (rect) => row >= rect.rowMin && row <= rect.rowMax && rect.colMin <= -1 && rect.colMax >= -1,
    );

  const hasAnyDataCellSelected = (row: number) =>
    effectiveSelectionRects.value.some((rect) => row >= rect.rowMin && row <= rect.rowMax && rect.colMax >= 0);

  const normalizeRow = (value: number) => Math.max(0, Math.min(rowCount.value - 1, value));

  const toMergedRanges = (ranges: RowRange[]) => {
    if (ranges.length === 0) return [];
    const sorted = ranges
      .map((range) => ({
        start: normalizeRow(range.start),
        end: normalizeRow(range.end),
      }))
      .filter((range) => range.start <= range.end)
      .sort((a, b) => a.start - b.start);
    if (sorted.length === 0) return [];
    const merged: RowRange[] = [{ ...sorted[0] }];
    for (let i = 1; i < sorted.length; i += 1) {
      const current = sorted[i];
      const tail = merged[merged.length - 1];
      if (current.start <= tail.end + 1) {
        tail.end = Math.max(tail.end, current.end);
      } else {
        merged.push({ ...current });
      }
    }
    return merged;
  };

  const getExcludedComplementRanges = () => {
    if (rowCount.value <= 0) return [];
    const normalizedExcluded = Array.from(rowSelection.rows)
      .map((row) => normalizeRow(row))
      .sort((a, b) => a - b);
    const uniqueExcluded = normalizedExcluded.filter((row, index) => index === 0 || row !== normalizedExcluded[index - 1]);
    const ranges: RowRange[] = [];
    let start = 0;
    for (const excluded of uniqueExcluded) {
      if (excluded > start) {
        ranges.push({ start, end: excluded - 1 });
      }
      start = excluded + 1;
      if (start >= rowCount.value) break;
    }
    if (start <= rowCount.value - 1) {
      ranges.push({ start, end: rowCount.value - 1 });
    }
    return ranges;
  };

  const collectSelectedRowRanges = () => {
    const ranges: RowRange[] = effectiveSelectionRects.value.map((rect) => ({
      start: rect.rowMin,
      end: rect.rowMax,
    }));

    if (rowSelection.mode === 'include-range' && rowSelection.rangeStart >= 0 && rowSelection.rangeEnd >= 0) {
      ranges.push({
        start: rowSelection.rangeStart,
        end: rowSelection.rangeEnd,
      });
    }

    if (rowSelection.mode === 'include-set') {
      rowSelection.rows.forEach((row) => {
        ranges.push({ start: row, end: row });
      });
    }

    if (rowSelection.mode === 'exclude-set') {
      ranges.push(...getExcludedComplementRanges());
    }

    return toMergedRanges(ranges);
  };

  const formatSelectedRowsForLog = () => {
    const ranges = collectSelectedRowRanges();
    if (ranges.length === 0) {
      return { count: 0, rows: [] as number[], ranges: [] as string[] };
    }

    const count = ranges.reduce((sum, range) => sum + (range.end - range.start + 1), 0);
    const MAX_EXPAND_ROWS = 2000;
    if (count <= MAX_EXPAND_ROWS) {
      const rows: number[] = [];
      ranges.forEach((range) => {
        for (let row = range.start; row <= range.end; row += 1) {
          rows.push(row + 1);
        }
      });
      return { count, rows, ranges: [] as string[] };
    }

    const rangeLabels = ranges.map((range) => (range.start === range.end ? `${range.start + 1}` : `${range.start + 1}-${range.end + 1}`));
    return { count, rows: [] as number[], ranges: rangeLabels };
  };

  const logSelectedRows = () => {
    const { count, rows, ranges } = formatSelectedRowsForLog();
    if (rows.length > 0 || count === 0) {
      console.log('[DivTable] selected rows:', rows);
      return;
    }
    console.log('[DivTable] selected rows:', {
      total: count,
      ranges,
    });
  };

  const clearCellSelection = () => {
    selection.selecting = false;
    selection.hasSelection = false;
    selectionState.anchorRow = -1;
    selectionState.anchorCol = -1;
    selectionState.mergeMode = false;
    selectionRects.splice(0, selectionRects.length);
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
    if (hasSelectedCell(row, col)) {
      classes.push('is-selected');
    }
    if (isRowMatched(row) || hasRowIndexSelected(row) || hasAnyDataCellSelected(row)) {
      classes.push('is-row-selected');
    }
    return classes.join(' ');
  };

  const rowIndexClass = (row: number) => {
    const classes: string[] = [];
    if (hasSelectedCell(row, -1)) {
      classes.push('is-selected');
    }
    if (isRowMatched(row) || hasRowIndexSelected(row) || hasAnyDataCellSelected(row)) {
      classes.push('is-row-selected');
    }
    return classes.join(' ');
  };

  const isSingleColumnSelected = (columnIndex: number) => {
    if (rowCount.value <= 0) return false;
    return effectiveSelectionRects.value.some(
      (rect) =>
        rect.colMin === columnIndex &&
        rect.colMax === columnIndex &&
        rect.rowMin === 0 &&
        rect.rowMax === rowCount.value - 1,
    );
  };

  const headerCellClass = (colIndex: number) => (isSingleColumnSelected(colIndex) ? 'is-column-selected' : '');

  const resolveCellTarget = (target: EventTarget | null) => {
    const element = target as HTMLElement | null;
    if (!element) return null;
    const cell =
      (element.closest('.div-table__cell') as HTMLElement | null) ??
      (element.closest('.div-table__row-index-cell') as HTMLElement | null);
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

  const clampRow = (row: number) => {
    if (rowCount.value <= 0) return -1;
    return Math.max(0, Math.min(rowCount.value - 1, row));
  };

  const isMacLike =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? '');

  const isPrimarySelectButton = (event: PointerEvent) =>
    event.button === 0 || (isMacLike && event.button === 2 && event.ctrlKey && !event.metaKey);

  const beginSelection = (point: { row: number; col: number }, event: PointerEvent) => {
    if (!isPrimarySelectButton(event)) return;
    const row = clampRow(point.row);
    if (row < 0) return;
    event.preventDefault();
    clearRowSelection();

    const hasAnchor = selectionState.anchorRow >= 0 && selectionState.anchorCol >= -1;
    const useAnchor = event.shiftKey && hasAnchor;
    const startRow = useAnchor ? selectionState.anchorRow : row;
    const startCol = useAnchor ? selectionState.anchorCol : point.col;
    const mergeMode = Boolean(event.ctrlKey || event.metaKey);

    if (!event.shiftKey || !hasAnchor) {
      selectionState.anchorRow = row;
      selectionState.anchorCol = point.col;
    }

    selectionState.mergeMode = mergeMode;
    selection.selecting = true;
    setSelection(startRow, startCol, row, point.col);
  };

  const commitSelection = () => {
    const active = activeSelectionRect.value;
    if (!active) return;
    if (selectionState.mergeMode) {
      selectionRects.push(active);
    } else {
      selectionRects.splice(0, selectionRects.length, active);
    }
    selection.hasSelection = selectionRects.length > 0;
    logSelectedRows();
  };

  const updateSelectionPoint = (point: { row: number; col: number }) => {
    if (!selection.selecting) return;
    const row = clampRow(point.row);
    if (row < 0) return;
    selection.endRow = row;
    selection.endCol = point.col;
  };

  const onBodyPointerDown = (event: PointerEvent) => {
    if (isInteractiveTarget(event.target)) return;
    const point = resolveCellTarget(event.target);
    if (!point) return;
    beginSelection(point, event);
  };

  const onBodyPointerMove = (event: PointerEvent) => {
    if (!selection.selecting) return;
    const point = resolveCellTarget(event.target);
    if (!point) return;
    updateSelectionPoint(point);
  };

  const stopSelection = () => {
    if (!selection.selecting) return;
    commitSelection();
    selection.selecting = false;
    selectionState.mergeMode = false;
  };

  const stopRowIndexSelection = () => {
    stopSelection();
  };

  const onRowIndexPointerDown = (event: PointerEvent) => {
    const point = resolveCellTarget(event.target);
    if (!point) return;
    beginSelection({ row: point.row, col: -1 }, event);
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
    return clampRow(row);
  };

  const onGlobalPointerMove = (event: PointerEvent) => {
    if (!selection.selecting) return false;
    const targetPoint = resolveCellTarget(event.target);
    if (targetPoint) {
      updateSelectionPoint(targetPoint);
      return true;
    }
    const rowByPointer = resolveRowByPointerY(event.clientY);
    if (rowByPointer >= 0) {
      updateSelectionPoint({ row: rowByPointer, col: selection.endCol });
      return true;
    }
    return true;
  };

  const selectColumn = (columnIndex: number) => {
    clearRowSelection();
    if (rowCount.value <= 0) {
      clearCellSelection();
      logSelectedRows();
      return;
    }
    selectionRects.splice(0, selectionRects.length, buildRect(0, columnIndex, rowCount.value - 1, columnIndex));
    selection.hasSelection = true;
    selection.selecting = false;
    selectionState.anchorRow = 0;
    selectionState.anchorCol = columnIndex;
    logSelectedRows();
  };

  const normalizeRowsToCells = (rows: number[]) => rows.map((row) => buildRect(row, -1, row, -1));

  const setSelectedRows = (rows: number | number[]) => {
    clearCellSelection();
    const normalized = normalizeRowsInput(rows);
    setIncludedRows(normalized, normalized[0] ?? -1);
    const rowCells = normalizeRowsToCells(normalized);
    if (rowCells.length > 0) {
      selectionRects.splice(0, selectionRects.length, ...rowCells);
      selection.hasSelection = true;
      selectionState.anchorRow = normalized[0] ?? -1;
      selectionState.anchorCol = -1;
    }
    logSelectedRows();
  };

  const matchRow = (rows: number | number[]) => {
    setSelectedRows(rows);
  };

  const reserveMatchRow = (rows: number | number[]) => {
    clearCellSelection();
    const normalized = normalizeRowsInput(rows);
    setRowSelectionSet(normalized, 'exclude-set');
    rowSelection.anchor = normalized[0] ?? -1;
    logSelectedRows();
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
