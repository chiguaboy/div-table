export interface DataManagerConfig {
  rowCount: number;
  colCount: number;
  batchSize: number;
  maxCache: number;
  buffer: number;
  batchIds?: number[];
  loadBatchRows?: (batchIds: number[]) => Promise<Map<number, string[]>>;
}

export class DataManager {
  private rowCache = new Map<number, string[]>();
  private order: number[] = [];
  private pendingBatches = new Set<number>();
  private readonly batchIds: number[];
  private readonly rowIndexByBatchId = new Map<number, number>();

  constructor(private config: DataManagerConfig) {
    this.batchIds = this.resolveBatchIds(config.batchIds);
    this.buildBatchIndexMap();
  }

  private resolveBatchIds(batchIds?: number[]) {
    if (!batchIds) {
      return Array.from({ length: this.config.rowCount }, (_, index) => index);
    }
    if (batchIds.length !== this.config.rowCount) {
      throw new Error(`batchIds length(${batchIds.length}) must equal rowCount(${this.config.rowCount})`);
    }
    return batchIds.slice();
  }

  private buildBatchIndexMap() {
    for (let rowIndex = 0; rowIndex < this.batchIds.length; rowIndex += 1) {
      const batchId = this.batchIds[rowIndex];
      if (!this.rowIndexByBatchId.has(batchId)) {
        this.rowIndexByBatchId.set(batchId, rowIndex);
      }
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
      const oldest = this.order.shift();
      if (oldest !== undefined) {
        this.rowCache.delete(oldest);
      }
    }
  }

  private createEmptyRow(): string[] {
    return new Array(this.config.colCount).fill('');
  }

  private getBatchId(index: number) {
    return this.batchIds[index];
  }

  private hasRowCached(index: number) {
    const batchId = this.getBatchId(index);
    if (batchId === undefined) return false;
    return this.rowCache.has(batchId);
  }

  private collectBatchIds(start: number, end: number) {
    const set = new Set<number>();
    for (let row = start; row <= end; row += 1) {
      const batchId = this.getBatchId(row);
      if (batchId !== undefined) set.add(batchId);
    }
    return Array.from(set);
  }

  private shouldLoadBuffer(rangeStart: number, rangeEnd: number) {
    let cachedInRange = 0;
    for (let row = rangeStart; row <= rangeEnd; row += 1) {
      if (this.hasRowCached(row)) cachedInRange += 1;
    }
    const missingInRange = rangeEnd - rangeStart + 1 - cachedInRange;
    if (missingInRange > 0) return true;
    return this.rowCache.size <= this.config.buffer;
  }

  private async defaultBatchRequest(batchIds: number[]) {
    // 仅作为本地 demo 的 mock 接口，真实业务建议通过 config.loadBatchRows 注入实际请求。
    await Promise.resolve();
    return new Map(
      batchIds.map((batchId) => {
        const rowIndex = this.rowIndexByBatchId.get(batchId) ?? 0;
        const row = Array.from({ length: this.config.colCount }, (_, colIndex) => `R${rowIndex + 1}-C${colIndex + 1}`);
        return [batchId, row] as const;
      }),
    );
  }

  private async loadBatch(batchIds: number[]) {
    const request = this.config.loadBatchRows ?? ((ids: number[]) => this.defaultBatchRequest(ids));
    return request(batchIds);
  }

  async ensureRange(start: number, end: number): Promise<boolean> {
    if (this.config.rowCount <= 0) return false;

    const rangeStart = Math.max(0, start);
    const rangeEnd = Math.min(this.config.rowCount - 1, end);
    if (rangeStart > rangeEnd) return false;

    const prefetchStart = Math.max(0, rangeStart - this.config.buffer);
    const prefetchEnd = Math.min(this.config.rowCount - 1, rangeEnd + this.config.buffer);

    if (!this.shouldLoadBuffer(rangeStart, rangeEnd)) {
      return false;
    }

    const batchIds = this.collectBatchIds(prefetchStart, prefetchEnd).filter((batchId) => {
      if (this.pendingBatches.has(batchId)) return false;
      return !this.rowCache.has(batchId);
    });

    if (batchIds.length === 0) return false;

    let hasUpdated = false;

    for (const batchId of batchIds) {
      this.pendingBatches.add(batchId);
    }

    try {
      const rowsByBatch = await this.loadBatch(batchIds);
      console.log('batchIds', batchIds);
      for (const batchId of batchIds) {
        const row = rowsByBatch.get(batchId);
        if (!row) continue;
        this.rowCache.set(batchId, row);
        this.touchBatch(batchId);
        hasUpdated = true;
      }
      console.log('this.cache', this.rowCache);
    } finally {
      for (const batchId of batchIds) {
        this.pendingBatches.delete(batchId);
      }
    }

    this.evictIfNeeded();
    return hasUpdated;
  }

  getRow(index: number): string[] {
    if (index < 0 || index >= this.config.rowCount) {
      return this.createEmptyRow();
    }

    const batchId = this.getBatchId(index);
    if (batchId === undefined) {
      return this.createEmptyRow();
    }

    const row = this.rowCache.get(batchId);
    if (!row) {
      void this.ensureRange(index, index);
      return this.createEmptyRow();
    }

    this.touchBatch(batchId);
    this.evictIfNeeded();
    return this.rowCache.get(batchId) ?? row;
  }

  updateCell(row: number, col: number, value: string) {
    if (row < 0 || row >= this.config.rowCount) return;
    if (col < 0 || col >= this.config.colCount) return;

    const batchId = this.getBatchId(row);
    if (batchId === undefined) return;

    const data = (this.rowCache.get(batchId) ?? this.createEmptyRow()).slice();
    data[col] = value;
    this.rowCache.set(batchId, data);
    this.touchBatch(batchId);
    this.evictIfNeeded();
  }

  refresh() {
    this.rowCache.clear();
    this.order = [];
    this.pendingBatches.clear();
  }
}
