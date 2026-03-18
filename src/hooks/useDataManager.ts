import { ref, type Ref } from 'vue';
import type { DataManager } from '../utils/dataManager';

interface UseDataManagerOptions {
  dataManager: Readonly<Ref<DataManager>>;
}

export const useDataManager = ({ dataManager }: UseDataManagerOptions) => {
  const dataVersion = ref(0);

  const ensureRange = async (start: number, end: number) => {
    const updated = await dataManager.value.ensureRange(start, end);
    if (updated) dataVersion.value += 1;
    return updated;
  };

  const getCellValue = (row: number, colIndex: number) => {
    dataVersion.value;
    return dataManager.value.getRow(row)[colIndex] ?? '';
  };

  const updateCell = (row: number, col: number, value: string) => {
    dataManager.value.updateCell(row, col, value);
    dataVersion.value += 1;
  };

  const refreshData = () => {
    dataManager.value.refresh();
    dataVersion.value += 1;
  };

  return {
    dataVersion,
    ensureRange,
    getCellValue,
    updateCell,
    refreshData,
  };
};
