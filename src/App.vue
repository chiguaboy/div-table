<template>
  <div>
    <h1>超大数据量 Div 表格 Demo</h1>
    <p>双击列头重命名，左侧图标拖拽换列，右侧图标调整列宽，点击列头中间选中整列。</p>
  </div>
  <div class="card">
    <DivTable
      :columns="columns"
      :row-count="rowCount"
      :row-height="rowHeight"
      :buffer-rows="bufferRows"
      :buffer-cols="bufferCols"
      :data-manager="dataManager"
    />
  </div>
</template>

<script setup lang="ts">
import DivTable from './components/DivTable.vue';
import { DataManager } from './utils/dataManager';
import type { ColumnDef } from './utils/columnManager';

const rowCount = 1_000_000;
const colCount = 1000;
const rowHeight = 36;
const bufferRows = 8;
const bufferCols = 4;

const columns: ColumnDef[] = Array.from({ length: colCount }, (_, index) => ({
  key: `col-${index + 1}`,
  label: `列 ${index + 1}`,
  width: index === 0 ? 200 : 140,
  align: index % 3 === 0 ? 'left' : index % 3 === 1 ? 'center' : 'right',
  visible: true,
  style: index % 2 === 0 ? { background: '#f8fafc' } : { background: '#ffffff' },
}));

columns[9].visible = false;

const batchSize = 200;
const batchIds = Array.from({ length: rowCount }, (_, rowIndex) => Math.floor(rowIndex / batchSize));

const dataManager = new DataManager({
  rowCount,
  colCount,
  batchSize,
  maxCache: 1200,
  buffer: 400,
  batchIds,
  loadBatchRows: async (ids) => {
    await Promise.resolve();
    return new Map(
      ids.map((batchId) => {
        const start = batchId * batchSize;
        const end = Math.min(start + batchSize, rowCount);
        const rows = Array.from({ length: end - start }, (_, offset) => {
          const rowIndex = start + offset;
          return Array.from({ length: colCount }, (_, colIndex) => `R${rowIndex + 1}-C${colIndex + 1}`);
        });
        return [batchId, rows] as const;
      }),
    );
  },
});
</script>

<style scoped>
p { margin: 4px 0 0; color: #475569; }
</style>
