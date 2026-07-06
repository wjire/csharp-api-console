import * as vscode from 'vscode';

export type RequestHistoryBodyMode = 'json' | 'formdata' | 'binary';

export interface RequestHistoryFormDataField {
    key: string;
    type: 'text' | 'file';
    value?: string;
    valueBase64?: string;
    fileName?: string;
    contentType?: string;
    enabled?: boolean;
}

export interface RequestHistoryResponseSnapshot {
    success: boolean;
    statusCode?: number;
    headers?: Record<string, string | string[] | undefined>;
    body?: string;
    error?: string;
    errorCode?: string;
    duration?: number;
}

export interface RequestHistoryItem {
    id: string;
    query: string;
    body: string;
    token?: string;
    timestamp: number;
    statusCode: number | null;
    headers?: Record<string, string>;
    bodyMode?: RequestHistoryBodyMode;
    binaryBodyBase64?: string;
    binaryContentType?: string;
    binaryFileName?: string;
    formDataFields?: RequestHistoryFormDataField[];
    response?: RequestHistoryResponseSnapshot;
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
        const current = Array.isArray(historyMap[endpointKey]) ? historyMap[endpointKey] : [];
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
        const rawHistoryMap = this.context.workspaceState.get<unknown>(RequestHistoryStore.STORAGE_KEY, {});
        if (!rawHistoryMap || typeof rawHistoryMap !== 'object' || Array.isArray(rawHistoryMap)) {
            return {};
        }

        const historyMap: HistoryMap = {};
        for (const [endpointKey, rawItems] of Object.entries(rawHistoryMap as Record<string, unknown>)) {
            if (!Array.isArray(rawItems)) {
                continue;
            }

            const items = rawItems
                .map(item => this.normalizeHistoryItem(item))
                .filter((item): item is RequestHistoryItem => item !== undefined);

            if (items.length > 0) {
                historyMap[endpointKey] = items;
            }
        }

        return historyMap;
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
            if (!Array.isArray(items)) {
                changed = true;
                continue;
            }

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

    private normalizeHistoryItem(rawItem: unknown): RequestHistoryItem | undefined {
        if (!rawItem || typeof rawItem !== 'object') {
            return undefined;
        }

        const item = rawItem as Record<string, unknown>;
        const id = typeof item.id === 'string' && item.id.trim()
            ? item.id
            : undefined;
        const timestamp = typeof item.timestamp === 'number' && Number.isFinite(item.timestamp)
            ? item.timestamp
            : undefined;

        if (!id || timestamp === undefined) {
            return undefined;
        }

        const statusCode = typeof item.statusCode === 'number'
            ? item.statusCode
            : null;

        const normalized: RequestHistoryItem = {
            id,
            timestamp,
            query: typeof item.query === 'string' ? item.query : '',
            body: typeof item.body === 'string' ? item.body : '',
            token: typeof item.token === 'string' ? item.token : '',
            statusCode
        };

        if (item.headers && typeof item.headers === 'object' && !Array.isArray(item.headers)) {
            normalized.headers = {};
            Object.entries(item.headers as Record<string, unknown>).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    normalized.headers![key] = value;
                }
            });
        }

        if (item.bodyMode === 'json' || item.bodyMode === 'formdata' || item.bodyMode === 'binary') {
            normalized.bodyMode = item.bodyMode;
        }

        if (typeof item.binaryBodyBase64 === 'string') {
            normalized.binaryBodyBase64 = item.binaryBodyBase64;
        }

        if (typeof item.binaryContentType === 'string') {
            normalized.binaryContentType = item.binaryContentType;
        }

        if (typeof item.binaryFileName === 'string') {
            normalized.binaryFileName = item.binaryFileName;
        }

        if (Array.isArray(item.formDataFields)) {
            normalized.formDataFields = item.formDataFields
                .map(field => this.normalizeFormDataField(field))
                .filter((field): field is RequestHistoryFormDataField => field !== undefined);
        }

        const response = this.normalizeResponseSnapshot(item.response);
        if (response) {
            normalized.response = response;
        }

        return normalized;
    }

    private normalizeFormDataField(rawField: unknown): RequestHistoryFormDataField | undefined {
        if (!rawField || typeof rawField !== 'object') {
            return undefined;
        }

        const field = rawField as Record<string, unknown>;
        const key = typeof field.key === 'string' ? field.key : '';
        if (!key) {
            return undefined;
        }

        const normalized: RequestHistoryFormDataField = {
            key,
            type: field.type === 'file' ? 'file' : 'text',
            enabled: field.enabled === false ? false : true
        };

        if (typeof field.value === 'string') {
            normalized.value = field.value;
        }

        if (typeof field.valueBase64 === 'string') {
            normalized.valueBase64 = field.valueBase64;
        }

        if (typeof field.fileName === 'string') {
            normalized.fileName = field.fileName;
        }

        if (typeof field.contentType === 'string') {
            normalized.contentType = field.contentType;
        }

        return normalized;
    }

    private normalizeResponseSnapshot(rawResponse: unknown): RequestHistoryResponseSnapshot | undefined {
        if (!rawResponse || typeof rawResponse !== 'object') {
            return undefined;
        }

        const response = rawResponse as Record<string, unknown>;
        const normalized: RequestHistoryResponseSnapshot = {
            success: response.success === true
        };

        if (typeof response.statusCode === 'number') {
            normalized.statusCode = response.statusCode;
        }

        if (response.headers && typeof response.headers === 'object' && !Array.isArray(response.headers)) {
            normalized.headers = {};
            Object.entries(response.headers as Record<string, unknown>).forEach(([key, value]) => {
                if (typeof value === 'string' || Array.isArray(value) || value === undefined) {
                    normalized.headers![key] = value as string | string[] | undefined;
                }
            });
        }

        if (typeof response.body === 'string') {
            normalized.body = response.body;
        }

        if (typeof response.error === 'string') {
            normalized.error = response.error;
        }

        if (typeof response.errorCode === 'string') {
            normalized.errorCode = response.errorCode;
        }

        if (typeof response.duration === 'number') {
            normalized.duration = response.duration;
        }

        return normalized;
    }
}
