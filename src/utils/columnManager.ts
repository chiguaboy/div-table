export type ColumnAlign = 'left' | 'center' | 'right';

export interface ColumnDef {
  key: string;
  label: string;
  width: number;
  align?: ColumnAlign;
  visible?: boolean;
  style?: Record<string, string>;
}

export interface ManagedColumn extends ColumnDef {
  index: number;
  visible: boolean;
  align: ColumnAlign;
}

const normalizeColumn = (col: ColumnDef, index: number): ManagedColumn => ({
  ...col,
  index,
  visible: col.visible ?? true,
  align: col.align ?? 'left',
});

export const createColumnManager = (input: ColumnDef[]) => {
  let columns = input.map(normalizeColumn);

  const getColumns = () => columns;

  const setColumns = (next: ColumnDef[]) => {
    columns = next.map(normalizeColumn);
  };

  const renameColumn = (index: number, label: string) => {
    const target = columns.find((col) => col.index === index);
    if (target) target.label = label.trim() || target.label;
  };

  const resizeColumn = (index: number, width: number) => {
    const target = columns.find((col) => col.index === index);
    if (target) target.width = Math.max(60, width);
  };

  const reorderColumnByPosition = (fromPosition: number, toPosition: number) => {
    if (fromPosition === toPosition) return;
    if (fromPosition < 0 || toPosition < 0) return;
    if (fromPosition >= columns.length || toPosition >= columns.length) return;
    const next = [...columns];
    const [moved] = next.splice(fromPosition, 1);
    next.splice(toPosition, 0, moved);
    columns = next;
  };

  const setColumnVisible = (index: number, visible: boolean) => {
    const target = columns.find((col) => col.index === index);
    if (target) target.visible = visible;
  };

  const setColumnAlign = (index: number, align: ColumnAlign) => {
    const target = columns.find((col) => col.index === index);
    if (target) target.align = align;
  };

  const getVisibleColumns = () => columns.filter((col) => col.visible);

  const getColumnWidths = () => getVisibleColumns().map((col) => col.width);

  return {
    getColumns,
    getVisibleColumns,
    getColumnWidths,
    setColumns,
    renameColumn,
    resizeColumn,
    reorderColumnByPosition,
    setColumnVisible,
    setColumnAlign,
  };
};
