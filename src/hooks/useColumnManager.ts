import { computed, ref, watch, type Ref } from 'vue';
import {
  createColumnManager,
  type ColumnAlign,
  type ColumnDef,
  type ManagedColumn,
} from '../utils/columnManager';

interface UseColumnManagerOptions {
  columns: Readonly<Ref<ColumnDef[]>>;
}

export const useColumnManager = ({ columns }: UseColumnManagerOptions) => {
  const manager = createColumnManager(columns.value);
  const allColumns = ref<ManagedColumn[]>(manager.getColumns().slice());
  const visibleColumns = computed(() => allColumns.value.filter((col) => col.visible));
  const visibleColumnWidths = computed(() => visibleColumns.value.map((col) => col.width));

  const syncColumns = () => {
    allColumns.value = manager.getColumns().slice();
  };

  const setColumns = (next: ColumnDef[]) => {
    manager.setColumns(next);
    syncColumns();
  };

  const findColumn = (columnIndex: number) => allColumns.value.find((col) => col.index === columnIndex);

  const renameColumn = (columnIndex: number, label: string) => {
    const target = findColumn(columnIndex);
    if (!target) return;
    const nextLabel = label.trim();
    if (!nextLabel || nextLabel === target.label) return;
    manager.renameColumn(columnIndex, label);
    syncColumns();
  };

  const resizeColumn = (columnIndex: number, width: number) => {
    const target = findColumn(columnIndex);
    if (!target) return;
    const nextWidth = Math.max(60, width);
    if (nextWidth === target.width) return;
    manager.resizeColumn(columnIndex, width);
    syncColumns();
  };

  const reorderColumnByPosition = (fromPosition: number, toPosition: number) => {
    if (fromPosition === toPosition) return;
    if (fromPosition < 0 || toPosition < 0) return;
    if (fromPosition >= allColumns.value.length || toPosition >= allColumns.value.length) return;
    manager.reorderColumnByPosition(fromPosition, toPosition);
    syncColumns();
  };

  const setColumnVisible = (columnIndex: number, visible: boolean) => {
    const target = findColumn(columnIndex);
    if (!target || target.visible === visible) return;
    manager.setColumnVisible(columnIndex, visible);
    syncColumns();
  };

  const setColumnAlign = (columnIndex: number, align: ColumnAlign) => {
    const target = findColumn(columnIndex);
    if (!target || target.align === align) return;
    manager.setColumnAlign(columnIndex, align);
    syncColumns();
  };

  const setAllColumnsAlign = (align: ColumnAlign) => {
    if (!allColumns.value.some((col) => col.align !== align)) return;
    allColumns.value.forEach((col) => manager.setColumnAlign(col.index, align));
    syncColumns();
  };

  watch(columns, (next) => {
    setColumns(next);
  });

  return {
    allColumns,
    visibleColumns,
    visibleColumnWidths,
    syncColumns,
    setColumns,
    renameColumn,
    resizeColumn,
    reorderColumnByPosition,
    setColumnVisible,
    setColumnAlign,
    setAllColumnsAlign,
  };
};
