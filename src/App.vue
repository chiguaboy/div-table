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

const dataManager = new DataManager({
  rowCount,
  colCount,
  batchSize: 200,
  maxCache: 1200,
  buffer: 400,
});
</script>

<style scoped>
p { margin: 4px 0 0; color: #475569; }
</style>
