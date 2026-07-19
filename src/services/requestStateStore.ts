import * as vscode from 'vscode';
import { FormDataField, HttpResponse } from './httpClient';

export type RequestStateBodyMode = 'json' | 'formdata' | 'binary';

export interface RequestStateSnapshot {
    baseUrl: string;
    headers: Record<string, string>;
    token: string;
    query: string;
    body: string;
    bodyMode: RequestStateBodyMode;
    binaryBodyBase64?: string;
    binaryContentType?: string;
    binaryFileName?: string;
    formDataFields?: FormDataField[];
    response?: HttpResponse;
}

type RequestStateMap = Record<string, RequestStateSnapshot>;

export class RequestStateStore {
    private static readonly STORAGE_KEY = 'requestState.byEndpoint';

    constructor(private readonly context: vscode.ExtensionContext) { }

    public getState(stateKey: string): RequestStateSnapshot | undefined {
        const stateMap = this.getStateMap();
        return stateMap[stateKey];
    }

    public async saveState(stateKey: string, snapshot: RequestStateSnapshot): Promise<void> {
        const stateMap = this.getStateMap();
        stateMap[stateKey] = snapshot;
        await this.context.workspaceState.update(RequestStateStore.STORAGE_KEY, stateMap);
    }

    private getStateMap(): RequestStateMap {
        const rawStateMap = this.context.workspaceState.get<unknown>(RequestStateStore.STORAGE_KEY, {});
        if (!rawStateMap || typeof rawStateMap !== 'object' || Array.isArray(rawStateMap)) {
            return {};
        }

        const stateMap: RequestStateMap = {};
        for (const [stateKey, rawSnapshot] of Object.entries(rawStateMap as Record<string, unknown>)) {
            const snapshot = this.normalizeSnapshot(rawSnapshot);
            if (snapshot) {
                stateMap[stateKey] = snapshot;
            }
        }

        return stateMap;
    }

    private normalizeSnapshot(rawSnapshot: unknown): RequestStateSnapshot | undefined {
        if (!rawSnapshot || typeof rawSnapshot !== 'object' || Array.isArray(rawSnapshot)) {
            return undefined;
        }

        const snapshot = rawSnapshot as Record<string, unknown>;
        const baseUrl = typeof snapshot.baseUrl === 'string' ? snapshot.baseUrl : '';
        const bodyMode = snapshot.bodyMode === 'formdata' || snapshot.bodyMode === 'binary'
            ? snapshot.bodyMode
            : 'json';

        const normalized: RequestStateSnapshot = {
            baseUrl,
            headers: this.normalizeStringRecord(snapshot.headers),
            token: typeof snapshot.token === 'string' ? snapshot.token : '',
            query: typeof snapshot.query === 'string' ? snapshot.query : '',
            body: typeof snapshot.body === 'string' ? snapshot.body : '',
            bodyMode
        };

        if (typeof snapshot.binaryBodyBase64 === 'string') {
            normalized.binaryBodyBase64 = snapshot.binaryBodyBase64;
        }

        if (typeof snapshot.binaryContentType === 'string') {
            normalized.binaryContentType = snapshot.binaryContentType;
        }

        if (typeof snapshot.binaryFileName === 'string') {
            normalized.binaryFileName = snapshot.binaryFileName;
        }

        if (Array.isArray(snapshot.formDataFields)) {
            normalized.formDataFields = snapshot.formDataFields
                .map(field => this.normalizeFormDataField(field))
                .filter((field): field is FormDataField => field !== undefined);
        }

        if (snapshot.response && typeof snapshot.response === 'object' && !Array.isArray(snapshot.response)) {
            const response = snapshot.response as Record<string, unknown>;
            normalized.response = {
                success: response.success === true,
                statusCode: typeof response.statusCode === 'number' ? response.statusCode : undefined,
                headers: this.normalizeStringRecord(response.headers),
                body: typeof response.body === 'string' ? response.body : undefined,
                error: typeof response.error === 'string' ? response.error : undefined,
                errorCode: typeof response.errorCode === 'string' ? response.errorCode : undefined,
                duration: typeof response.duration === 'number' ? response.duration : 0
            };
        }

        return normalized;
    }

    private normalizeStringRecord(value: unknown): Record<string, string> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }

        const normalized: Record<string, string> = {};
        for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
            if (typeof rawValue === 'string') {
                normalized[key] = rawValue;
            }
        }

        return normalized;
    }

    private normalizeFormDataField(rawField: unknown): FormDataField | undefined {
        if (!rawField || typeof rawField !== 'object' || Array.isArray(rawField)) {
            return undefined;
        }

        const field = rawField as Record<string, unknown>;
        const key = typeof field.key === 'string' ? field.key.trim() : '';
        if (!key) {
            return undefined;
        }

        const normalized: FormDataField = {
            key,
            type: field.type === 'file' ? 'file' : 'text'
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
}
