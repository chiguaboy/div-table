<template>
  <div>
    <h1>超大数据量 Div 表格 Demo</h1>
    <p>
      支持 100 万行、1000 列、行列虚拟滚动、拖拽列宽/列序、框选与单元格编辑。
    </p>
  </div>
  <div class="card">
    <DivTable
      :columns="columns"
      :row-count="rowCount"
      :row-height="rowHeight"
      :buffer-rows="bufferRows"
      :buffer-cols="bufferCols"
      :data-manager="dataManager"
    >
      <template #header="{ column }">
        <div class="header-slot">
          <span>{{ column.label }}</span>
          <span class="badge">{{ column.key }}</span>
        </div>
      </template>
    </DivTable>
  </div>
</template>

<script setup lang="ts">
import DivTable from './components/DivTable.vue';
import { DataManager } from './utils/dataManager';

const rowCount = 1_000_000;
const colCount = 1000;
const rowHeight = 36;
const bufferRows = 6;
const bufferCols = 3;

const columns = Array.from({ length: colCount }, (_, index) => ({
  key: `col-${index + 1}`,
  label: `列 ${index + 1}`,
  width: index === 0 ? 180 : 140,
  style: index % 2 === 0 ? { background: '#f8fafc' } : { background: '#ffffff' },
}));

const dataManager = new DataManager({
  rowCount,
  colCount,
  batchSize: 200,
  maxCache: 1000,
});
</script>

<style scoped>
.header-slot {
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge {
  background: #e2e8f0;
  color: #334155;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
}

p {
  margin: 4px 0 0;
  color: #475569;
}
</style>
