export interface DataManagerConfig {
  rowCount: number;
  colCount: number;
  batchSize: number;
  maxCache: number;
  buffer: number;
  batchIds: number[];
  loadBatchRows: (batchIds: number[]) => Promise<Map<number, string[][]>>;
}

export class DataManager {
  private rowCache = new Map<number, Map<number, string[]>>();
  private order: number[] = [];
  private pendingBatches = new Set<number>();
  private rowPositionInBatch = new Array<number>();
  private batchRowIndices = new Map<number, number[]>();

  constructor(private config: DataManagerConfig) {
    this.initBatchMappings();
  }

  private initBatchMappings() {
    if (this.config.batchIds.length !== this.config.rowCount) {
      throw new Error('batchIds length must equal rowCount');
    }

    for (let rowIndex = 0; rowIndex < this.config.rowCount; rowIndex += 1) {
      const batchId = this.config.batchIds[rowIndex];
      const rowIndices = this.batchRowIndices.get(batchId) ?? [];
      this.rowPositionInBatch[rowIndex] = rowIndices.length;
      rowIndices.push(rowIndex);
      this.batchRowIndices.set(batchId, rowIndices);
    }
  }

  private touchBatch(batchId: number) {
    const existingIndex = this.order.indexOf(batchId);
    if (existingIndex !== -1) {
      this.order.splice(existingIndex, 1);
    }
    this.order.push(batchId);
  }

  private evictIfNeeded() {
    while (this.order.length > this.config.maxCache) {
      const oldestBatchId = this.order.shift();
      if (oldestBatchId !== undefined) {
        this.rowCache.delete(oldestBatchId);
      }
    }
  }

  private createEmptyRow() {
    return new Array(this.config.colCount).fill('');
  }

  private hasRow(rowIndex: number) {
    const batchId = this.config.batchIds[rowIndex];
    const batchData = this.rowCache.get(batchId);
    return Boolean(batchData?.has(rowIndex));
  }

  private shouldLoadBuffer(rangeStart: number, rangeEnd: number) {
    for (let row = rangeStart; row <= rangeEnd; row += 1) {
      if (!this.hasRow(row)) return true;
    }
    return this.rowCache.size <= this.config.buffer;
  }

  private collectBatchIds(startRow: number, endRow: number) {
    const ids: number[] = [];
    const unique = new Set<number>();

    for (let row = startRow; row <= endRow; row += 1) {
      const batchId = this.config.batchIds[row];
      if (unique.has(batchId)) continue;
      unique.add(batchId);

      if (this.pendingBatches.has(batchId)) continue;

      const hasBatch = this.rowCache.has(batchId);
      if (hasBatch) {
        const rowIndices = this.batchRowIndices.get(batchId) ?? [];
        const batchData = this.rowCache.get(batchId);
        const completed = rowIndices.length > 0 && rowIndices.every((rowIndex) => batchData?.has(rowIndex));
        if (completed) continue;
      }

      ids.push(batchId);
      this.pendingBatches.add(batchId);
    }

    return ids;
  }

  async ensureRange(start: number, end: number) {
    const rangeStart = Math.max(0, start);
    const rangeEnd = Math.min(this.config.rowCount - 1, end);
    const prefetchStart = Math.max(0, rangeStart - this.config.buffer);
    const prefetchEnd = Math.min(this.config.rowCount - 1, rangeEnd + this.config.buffer);

    if (!this.shouldLoadBuffer(rangeStart, rangeEnd)) {
      return;
    }

    const needBatchIds = this.collectBatchIds(prefetchStart, prefetchEnd);
    if (needBatchIds.length === 0) return;

    try {
      const rowsByBatch = await this.config.loadBatchRows(needBatchIds);

      for (const batchId of needBatchIds) {
        const rows = rowsByBatch.get(batchId);
        if (!rows) continue;

        const rowIndices = this.batchRowIndices.get(batchId) ?? [];
        const batchData = new Map<number, string[]>();
        const limit = Math.min(rows.length, rowIndices.length);

        for (let i = 0; i < limit; i += 1) {
          batchData.set(rowIndices[i], rows[i]);
        }

        this.rowCache.set(batchId, batchData);
        this.touchBatch(batchId);
      }

      this.evictIfNeeded();
    } finally {
      for (const batchId of needBatchIds) {
        this.pendingBatches.delete(batchId);
      }
    }

    const batchIds: number[] = [];
    for (let row = prefetchStart; row <= prefetchEnd; row += this.config.batchSize) {
      const batchStart = this.resolveBatchStart(row);
      if (this.pendingBatches.has(batchStart)) continue;

      const batchEnd = Math.min(batchStart + this.config.batchSize - 1, this.config.rowCount - 1);
      let hasMissing = false;
      for (let current = batchStart; current <= batchEnd; current += 1) {
        if (!this.rowCache.has(current)) {
          hasMissing = true;
          break;
        }
      }
      if (!hasMissing) continue;
      this.pendingBatches.add(batchStart);
      batchIds.push(batchStart);
    }

    if (batchIds.length === 0) return;

    const rowsByBatch = await this.loadBatch(batchIds);
    for (const batchStart of batchIds) {
      const rows = rowsByBatch.get(batchStart);
      if (!rows) {
        this.pendingBatches.delete(batchStart);
        continue;
      }
      for (let offset = 0; offset < rows.length; offset += 1) {
        const rowIndex = batchStart + offset;
        if (rowIndex >= this.config.rowCount) break;
        this.rowCache.set(rowIndex, rows[offset]);
        this.touchRow(rowIndex);
      }
      this.pendingBatches.delete(batchStart);
    }

    this.evictIfNeeded();
  }

  getRow(index: number): string[] {
    if (index < 0 || index >= this.config.rowCount) {
      return this.createEmptyRow();
    }

    const batchId = this.config.batchIds[index];
    const batchData = this.rowCache.get(batchId);
    const row = batchData?.get(index);

    if (row) {
      this.touchBatch(batchId);
      this.evictIfNeeded();
      return row;
    }

    void this.ensureRange(index, index);
    return this.createEmptyRow();
  }

  updateCell(row: number, col: number, value: string) {
    const batchId = this.config.batchIds[row];
    const batchData = this.rowCache.get(batchId) ?? new Map<number, string[]>();
    const current = batchData.get(row) ?? this.createEmptyRow();
    const data = current.slice();
    data[col] = value;
    batchData.set(row, data);
    this.rowCache.set(batchId, batchData);
    this.touchBatch(batchId);
    this.evictIfNeeded();
  }

  refresh() {
    this.rowCache.clear();
    this.order = [];
    this.pendingBatches.clear();
  }
}
