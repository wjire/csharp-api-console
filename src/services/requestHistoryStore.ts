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

    constructor(private readonly context: vscode.ExtensionContext) { }

    public getHistory(endpointKey: string): RequestHistoryItem[] {
        const historyMap = this.getHistoryMap();
        const list = historyMap[endpointKey] ?? [];
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
}
