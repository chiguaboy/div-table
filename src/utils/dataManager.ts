export interface DataManagerConfig {
  rowCount: number;
  colCount: number;
  batchSize: number;
  maxCache: number;
  buffer: number;
}

export class DataManager {
  private rowCache = new Map<number, string[]>();
  private order: number[] = [];
  private pendingBatches = new Set<number>();

  constructor(private config: DataManagerConfig) {}

  private touchRow(index: number) {
    const existingIndex = this.order.indexOf(index);
    if (existingIndex !== -1) {
      this.order.splice(existingIndex, 1);
    }
    this.order.push(index);
  }

  private evictIfNeeded() {
    while (this.order.length > this.config.maxCache) {
      const oldest = this.order.shift();
      if (oldest !== undefined) {
        this.rowCache.delete(oldest);
      }
    }
  }

  private generateRow(index: number): string[] {
    const row: string[] = new Array(this.config.colCount);
    for (let col = 0; col < this.config.colCount; col += 1) {
      row[col] = `R${index + 1}-C${col + 1}`;
    }
    return row;
  }

  private resolveBatchStart(index: number) {
    return Math.floor(index / this.config.batchSize) * this.config.batchSize;
  }

  private shouldLoadBuffer(rangeStart: number, rangeEnd: number) {
    let cachedInRange = 0;
    for (let row = rangeStart; row <= rangeEnd; row += 1) {
      if (this.rowCache.has(row)) cachedInRange += 1;
    }
    const missingInRange = rangeEnd - rangeStart + 1 - cachedInRange;
    if (missingInRange > 0) return true;
    return this.rowCache.size <= this.config.buffer;
  }

  private async loadBatch(batchIds: number[]) {
    const rowsByBatch = new Map<number, string[][]>();
    await Promise.resolve();

    for (const batchStart of batchIds) {
      const end = Math.min(batchStart + this.config.batchSize, this.config.rowCount);
      const rows: string[][] = [];
      for (let i = batchStart; i < end; i += 1) {
        const row = this.generateRow(i);
        rows.push(row);
      }
      rowsByBatch.set(batchStart, rows);
    }

    return rowsByBatch;
  }

  async ensureRange(start: number, end: number) {
    const rangeStart = Math.max(0, start);
    const rangeEnd = Math.min(this.config.rowCount - 1, end);
    const prefetchStart = Math.max(0, rangeStart - this.config.buffer);
    const prefetchEnd = Math.min(this.config.rowCount - 1, rangeEnd + this.config.buffer);

    if (!this.shouldLoadBuffer(rangeStart, rangeEnd)) {
      return;
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
    if (!this.rowCache.has(index)) {
      void this.ensureRange(index, index);
    }
    const row = this.rowCache.get(index);
    if (row) {
      this.touchRow(index);
      this.evictIfNeeded();
      return row;
    }
    return this.generateRow(index);
  }

  updateCell(row: number, col: number, value: string) {
    const data = this.getRow(row).slice();
    data[col] = value;
    this.rowCache.set(row, data);
    this.touchRow(row);
  }

  refresh() {
    this.rowCache.clear();
    this.order = [];
    this.pendingBatches.clear();
  }
}
