import * as vscode from 'vscode';

export interface RequestHistoryItem {
    id: string;
    query: string;
    body: string;
    timestamp: number;
    statusCode: number | null;
}

type HistoryMap = Record<string, RequestHistoryItem[]>;

export class RequestHistoryStore {
    private static readonly STORAGE_KEY = 'requestHistory.byEndpoint';
    private static readonly DEFAULT_HISTORY_TTL_DAYS = 3;

    constructor(private readonly context: vscode.ExtensionContext) { }

    public async getHistory(endpointKey: string): Promise<RequestHistoryItem[]> {
        const historyMap = this.getHistoryMap();
        const pruned = this.pruneHistoryMap(historyMap);
        if (pruned.changed) {
            await this.context.workspaceState.update(RequestHistoryStore.STORAGE_KEY, pruned.historyMap);
        }

        const list = pruned.historyMap[endpointKey] ?? [];
        return [...list].sort((a, b) => b.timestamp - a.timestamp);
    }

    public async addHistory(endpointKey: string, item: RequestHistoryItem, limit: number): Promise<RequestHistoryItem[]> {
        const historyMap = this.getHistoryMap();
        const current = historyMap[endpointKey] ?? [];
        const deduped = current.filter(existing => existing.id !== item.id);
        const next = [item, ...deduped].slice(0, Math.max(1, limit));
        historyMap[endpointKey] = next;

        await this.context.workspaceState.update(RequestHistoryStore.STORAGE_KEY, historyMap);
        return [...next];
    }

    public async clearEndpointHistory(endpointKey: string): Promise<void> {
        const historyMap = this.getHistoryMap();
        if (historyMap[endpointKey]) {
            delete historyMap[endpointKey];
            await this.context.workspaceState.update(RequestHistoryStore.STORAGE_KEY, historyMap);
        }
    }

    private getHistoryMap(): HistoryMap {
        return this.context.workspaceState.get<HistoryMap>(RequestHistoryStore.STORAGE_KEY, {});
    }

    private getHistoryTtlMs(): number {
        const config = vscode.workspace.getConfiguration('csharpApiConsole');
        const ttlDays = config.get<number>('requestHistoryTtlDays');

        if (typeof ttlDays === 'number') {
            if (ttlDays <= 0) {
                return 0;
            }

            return ttlDays * 24 * 60 * 60 * 1000;
        }

        // 向后兼容：若用户仍保留旧配置（秒），则继续生效
        const legacyTtlSeconds = config.get<number>(
            'requestHistoryTtlSeconds',
            RequestHistoryStore.DEFAULT_HISTORY_TTL_DAYS * 24 * 60 * 60
        );

        if (typeof legacyTtlSeconds !== 'number' || legacyTtlSeconds <= 0) {
            return 0;
        }

        return legacyTtlSeconds * 1000;
    }

    private pruneHistoryMap(historyMap: HistoryMap): { historyMap: HistoryMap; changed: boolean } {
        const ttlMs = this.getHistoryTtlMs();
        if (ttlMs <= 0) {
            return { historyMap, changed: false };
        }

        const now = Date.now();
        let changed = false;
        const nextMap: HistoryMap = {};

        for (const [endpointKey, items] of Object.entries(historyMap)) {
            const filtered = items.filter(item => now - item.timestamp <= ttlMs);

            if (filtered.length > 0) {
                nextMap[endpointKey] = filtered;
            }

            if (filtered.length !== items.length) {
                changed = true;
            }
        }

        return changed ? { historyMap: nextMap, changed } : { historyMap, changed };
    }
}
