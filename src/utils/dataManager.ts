export interface DataManagerConfig {
  rowCount: number;
  colCount: number;
  batchSize: number;
  maxCache: number;
  buffer: number;
  loadBatchRows?: (batchIds: number[]) => Promise<Map<number, string[][]>>;
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

  private createEmptyRow(): string[] {
    return new Array(this.config.colCount).fill('');
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

  private async defaultBatchRequest(batchIds: number[]) {
    // 仅作为本地 demo 的 mock 接口，真实业务建议通过 config.loadBatchRows 注入实际请求。
    await Promise.resolve();
    return new Map(
      batchIds.map((batchStart) => {
        const end = Math.min(batchStart + this.config.batchSize, this.config.rowCount);
        const rows = Array.from({ length: end - batchStart }, (_, offset) => {
          const rowIndex = batchStart + offset;
          return Array.from({ length: this.config.colCount }, (_, colIndex) => `R${rowIndex + 1}-C${colIndex + 1}`);
        });
        return [batchStart, rows] as const;
      }),
    );
  }

  private async loadBatch(batchIds: number[]) {
    const request = this.config.loadBatchRows ?? ((ids: number[]) => this.defaultBatchRequest(ids));
    return request(batchIds);
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
    return this.createEmptyRow();
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
