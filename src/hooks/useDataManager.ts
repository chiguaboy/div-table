import { ref } from 'vue';
import type { DataManager } from '../utils/dataManager';

interface UseDataManagerOptions {
  dataManager: DataManager;
}

export const useDataManager = ({ dataManager }: UseDataManagerOptions) => {
  const dataVersion = ref(0);

  const ensureRange = async (start: number, end: number) => {
    const updated = await dataManager.ensureRange(start, end);
    if (updated) dataVersion.value += 1;
    return updated;
  };

  const getCellValue = (row: number, colIndex: number) => {
    dataVersion.value;
    return dataManager.getRow(row)[colIndex] ?? '';
  };

  const updateCell = (row: number, col: number, value: string) => {
    dataManager.updateCell(row, col, value);
    dataVersion.value += 1;
  };

  const refreshData = () => {
    dataManager.refresh();
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
