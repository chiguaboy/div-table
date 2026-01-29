export interface DataManagerConfig {
  rowCount: number;
  colCount: number;
  batchSize: number;
  maxCache: number;
}

export class DataManager {
  private rowCache = new Map<number, string[]>();
  private order: number[] = [];

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

  private loadBatch(start: number) {
    const end = Math.min(start + this.config.batchSize, this.config.rowCount);
    for (let i = start; i < end; i += 1) {
      if (!this.rowCache.has(i)) {
        this.rowCache.set(i, this.generateRow(i));
        this.touchRow(i);
      }
    }
    this.evictIfNeeded();
  }

  ensureRange(start: number, end: number) {
    const rangeStart = Math.max(0, start);
    const rangeEnd = Math.min(this.config.rowCount - 1, end);
    for (let row = rangeStart; row <= rangeEnd; row += this.config.batchSize) {
      this.loadBatch(row);
    }
  }

  getRow(index: number): string[] {
    if (!this.rowCache.has(index)) {
      this.loadBatch(index);
    }
    this.touchRow(index);
    this.evictIfNeeded();
    return this.rowCache.get(index) ?? this.generateRow(index);
  }

  updateCell(row: number, col: number, value: string) {
    const data = this.getRow(row).slice();
    data[col] = value;
    this.rowCache.set(row, data);
    this.touchRow(row);
  }
}
