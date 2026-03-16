import { nextTick, reactive, type Ref } from 'vue';
import type { ManagedColumn } from '../utils/columnManager';

interface UseEditingOptions {
  bodyRef: Ref<HTMLDivElement | null>;
  headerRef: Ref<HTMLDivElement | null>;
  getCellValue: (row: number, col: number) => string;
  updateCell: (row: number, col: number, value: string) => void;
  renameColumn: (columnIndex: number, label: string) => void;
  onRenamed?: () => void;
}

export const useEditing = ({ bodyRef, headerRef, getCellValue, updateCell, renameColumn, onRenamed }: UseEditingOptions) => {
  const editing = reactive({ row: -1, col: -1, value: '' });
  const renameState = reactive({ index: -1, value: '' });

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
    updateCell(editing.row, editing.col, editing.value);
    editing.row = -1;
    editing.col = -1;
    editing.value = '';
  };

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
    renameColumn(renameState.index, renameState.value);
    renameState.index = -1;
    renameState.value = '';
    onRenamed?.();
  };

  const cancelRename = () => {
    renameState.index = -1;
    renameState.value = '';
  };

  return {
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
  };
};
