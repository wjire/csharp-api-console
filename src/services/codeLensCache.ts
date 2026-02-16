import * as vscode from 'vscode';

/**
 * 缓存条目
 */
export interface CacheEntry {
    version: number;        // 文档版本号
    codeLenses: vscode.CodeLens[];  // 扫描结果
}

interface CacheRecord {
    entry: CacheEntry;
    lastAccessAt: number;
}

/**
 * CodeLens 缓存管理器
 * 负责缓存 CodeLens 扫描结果，避免重复扫描，并提供防抖动功能
 */
export class CodeLensCache {
    // 缓存存储：文档 URI → 缓存记录
    private cache = new Map<string, CacheRecord>();

    // 防抖动定时器（每个文档独立）
    private debounceTimers = new Map<string, NodeJS.Timeout>();

    // 缓存 TTL（毫秒），0 表示禁用 TTL
    private cacheTtlMs = 120_000;

    // 缓存最大条目数（用于 LRU 淘汰）
    private cacheMaxEntries = 100;

    constructor() {
        this.reloadConfig();

        // 监听配置变化，动态更新缓存策略
        vscode.workspace.onDidChangeConfiguration(event => {
            if (
                event.affectsConfiguration('csharpApiConsole.codeLensCacheTtlSeconds') ||
                event.affectsConfiguration('csharpApiConsole.codeLensCacheMaxEntries')
            ) {
                this.reloadConfig();
                this.evictExpiredEntries();
                this.evictByCapacity();
            }
        });

        // 监听文档关闭事件，清理缓存和定时器
        // 避免文档关闭后重新打开时使用过期的缓存
        vscode.workspace.onDidCloseTextDocument(document => {
            const key = document.uri.toString();

            // 清理缓存
            this.cache.delete(key);

            // 清理防抖定时器
            const timer = this.debounceTimers.get(key);
            if (timer) {
                clearTimeout(timer);
                this.debounceTimers.delete(key);
            }
        });
    }

    /**
     * 获取缓存
     * @param key 文档 URI
     * @returns 缓存条目或 undefined
     */
    get(key: string): CacheEntry | undefined {
        const record = this.cache.get(key);
        if (!record) {
            return undefined;
        }

        if (this.isExpired(record)) {
            this.cache.delete(key);
            return undefined;
        }

        // 命中后更新最近访问时间，并移动到 Map 末尾（用于 LRU）
        record.lastAccessAt = Date.now();
        this.touchKey(key, record);

        return record.entry;
    }

    /**
     * 设置缓存
     * @param key 文档 URI
     * @param entry 缓存条目
     */
    set(key: string, entry: CacheEntry): void {
        this.evictExpiredEntries();

        const record: CacheRecord = {
            entry,
            lastAccessAt: Date.now()
        };

        this.touchKey(key, record);
        this.evictByCapacity();
    }

    /**
     * 删除缓存
     * @param key 文档 URI
     */
    delete(key: string): void {
        this.cache.delete(key);
    }

    /**
     * 清除防抖定时器
     * @param key 文档 URI
     */
    clearDebounceTimer(key: string): void {
        const timer = this.debounceTimers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.debounceTimers.delete(key);
        }
    }

    /**
     * 设置防抖定时器
     * @param key 文档 URI
     * @param callback 延迟执行的回调函数
     * @param delay 延迟时间（毫秒）
     * @returns Promise，在延迟后或立即返回结果
     */
    async debounce<T>(
        key: string,
        callback: () => Promise<T>,
        delay: number,
        fallback?: T
    ): Promise<T> {
        // 清除该文档之前的防抖定时器
        this.clearDebounceTimer(key);

        // 如果配置为 0，立即执行（不使用防抖）
        if (delay === 0) {
            return await callback();
        }

        // 创建新的防抖定时器
        return new Promise<T>((resolve) => {
            const timer = setTimeout(async () => {
                // 延迟后执行回调
                const result = await callback();

                // 清理定时器
                this.debounceTimers.delete(key);

                resolve(result);
            }, delay);

            // 保存定时器
            this.debounceTimers.set(key, timer);

            // 如果有 fallback，立即返回（后台会更新）
            if (fallback !== undefined) {
                resolve(fallback);
            }
        });
    }

    /**
     * 清空所有缓存
     */
    clearAll(): void {
        this.cache.clear();

        // 清理所有定时器
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.debounceTimers.clear();
    }

    private reloadConfig(): void {
        const config = vscode.workspace.getConfiguration('csharpApiConsole');
        const ttlSeconds = config.get<number>('codeLensCacheTtlSeconds', 120);
        const maxEntries = config.get<number>('codeLensCacheMaxEntries', 100);

        this.cacheTtlMs = ttlSeconds <= 0 ? 0 : ttlSeconds * 1000;
        this.cacheMaxEntries = Math.max(1, maxEntries);
    }

    private isExpired(record: CacheRecord): boolean {
        if (this.cacheTtlMs === 0) {
            return false;
        }

        return Date.now() - record.lastAccessAt > this.cacheTtlMs;
    }

    private evictExpiredEntries(): void {
        if (this.cacheTtlMs === 0 || this.cache.size === 0) {
            return;
        }

        for (const [key, record] of this.cache) {
            if (this.isExpired(record)) {
                this.cache.delete(key);
            }
        }
    }

    private evictByCapacity(): void {
        while (this.cache.size > this.cacheMaxEntries) {
            const oldestKey = this.cache.keys().next().value as string | undefined;
            if (!oldestKey) {
                break;
            }

            this.cache.delete(oldestKey);
        }
    }

    private touchKey(key: string, record: CacheRecord): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        this.cache.set(key, record);
    }
}
