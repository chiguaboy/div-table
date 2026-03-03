export interface DataManagerConfig {
  rowCount: number;
  colCount: number;
  batchSize: number;
  maxCache: number;
}

export class DataManager {
  private rowCache = new Map<number, string[]>();
  private order: number[] = [];
  private loadingBatches = new Map<number, Promise<void>>();

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

  private createRow(index: number): string[] {
    const row: string[] = new Array(this.config.colCount);
    for (let col = 0; col < this.config.colCount; col += 1) {
      row[col] = `R${index + 1}-C${col + 1}`;
    }
    return row;
  }

  private async generateRow(batchIds: number[]): Promise<Map<number, string[]>> {
    const rows = new Map<number, string[]>();

    await Promise.resolve();

    for (const id of batchIds) {
      rows.set(id, this.createRow(id));
    }

    return rows;
  }

  private async loadBatch(start: number) {
    const batchStart = Math.max(0, start);
    const loading = this.loadingBatches.get(batchStart);
    if (loading) {
      await loading;
      return;
    }

    const task = (async () => {
      const end = Math.min(batchStart + this.config.batchSize, this.config.rowCount);
      const missingIds: number[] = [];
      for (let i = batchStart; i < end; i += 1) {
        if (!this.rowCache.has(i)) {
          missingIds.push(i);
        }
      }

      if (missingIds.length > 0) {
        const rows = await this.generateRow(missingIds);
        for (const id of missingIds) {
          const row = rows.get(id);
          if (row) {
            this.rowCache.set(id, row);
            this.touchRow(id);
          }
        }
      }

      this.evictIfNeeded();
    })();

    this.loadingBatches.set(batchStart, task);
    try {
      await task;
    } finally {
      this.loadingBatches.delete(batchStart);
    }
  }

  async ensureRange(start: number, end: number) {
    const rangeStart = Math.max(0, start);
    const rangeEnd = Math.min(this.config.rowCount - 1, end);
    for (let row = rangeStart; row <= rangeEnd; row += this.config.batchSize) {
      await this.loadBatch(row);
    }
  }

  getRow(index: number): string[] {
    if (!this.rowCache.has(index)) {
      const batchStart = Math.floor(index / this.config.batchSize) * this.config.batchSize;
      void this.loadBatch(batchStart);
      return this.createRow(index);
    }

    this.touchRow(index);
    this.evictIfNeeded();
    return this.rowCache.get(index) ?? this.createRow(index);
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
    this.loadingBatches.clear();
  }
}
