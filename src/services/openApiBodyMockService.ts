import * as http from 'http';
import * as https from 'https';
import * as vscode from 'vscode';
import { lang } from '../languageManager';
import { ApiEndpoint } from '../models/apiEndpoint';
import { SwaggerDocumentCacheStore } from './swaggerDocumentCacheStore';

export type MockQueryEntry = {
    key: string;
    value: string;
};

export type MockFormDataEntry = {
    key: string;
    value: string;
    type: 'text';
};

export type MockAllResult = {
    success: boolean;
    body?: string;
    queryEntries?: MockQueryEntry[];
    formDataEntries?: MockFormDataEntry[];
    source?: 'swagger-url' | 'swagger-cache';
    swaggerUrl?: string;
    message?: string;
};

type OpenApiDocument = {
    openapi?: string;
    swagger?: string;
    paths?: Record<string, Record<string, any>>;
    components?: Record<string, any>;
};

export class OpenApiBodyMockService {
    private static readonly swaggerFetchTimeoutMs = 30000;
    private readonly swaggerCacheStore = new SwaggerDocumentCacheStore();

    public async generateAllFromSwagger(
        apiEndpoint: ApiEndpoint,
        currentBaseUrl?: string,
        projectPath?: string
    ): Promise<MockAllResult> {
        const method = (apiEndpoint.httpMethod || '').trim().toUpperCase();
        if (!method) {
            return {
                success: false,
                message: lang.t('mock.error.missingHttpMethod')
            };
        }

        const route = this.normalizeRoutePath(apiEndpoint.routeTemplate || '');
        if (!route) {
            return {
                success: false,
                message: lang.t('mock.error.missingRouteTemplate')
            };
        }

        return this.tryGenerateAllFromSwaggerUrl(method, route, currentBaseUrl, projectPath);
    }

    private async tryGenerateAllFromSwaggerUrl(
        method: string,
        route: string,
        currentBaseUrl?: string,
        projectPath?: string
    ): Promise<MockAllResult> {
        const normalizedBaseUrl = this.normalizeBaseUrl(currentBaseUrl || '');
        if (!normalizedBaseUrl) {
            return {
                success: false,
                message: lang.t('mock.error.missingSwaggerBaseUrl')
            };
        }

        const cachedResult = this.tryGenerateFromCachedDocument(method, route, projectPath);
        if (cachedResult.matchedOperation) {
            if (cachedResult.result) {
                return cachedResult.result;
            }

            return {
                success: false,
                message: lang.t('mock.error.swaggerMatchedNoSchema')
            };
        }

        const candidates = this.buildSwaggerUrlCandidates(normalizedBaseUrl);
        let matchedOperationWithoutMockData = false;

        for (const candidateUrl of candidates) {
            const document = await this.tryFetchOpenApiDocument(candidateUrl);
            if (!document) {
                continue;
            }

            this.saveDocumentToProjectCache(projectPath, candidateUrl, document);

            const operationContext = this.findOperationContext(document, method, route);
            if (!operationContext) {
                continue;
            }

            const body = this.tryBuildBodyFromOperation(operationContext.operation, document);
            const queryEntries = this.tryBuildQueryEntriesFromOperation(
                operationContext.operation,
                operationContext.pathItem,
                document
            );
            const formDataEntries = this.tryBuildFormDataEntriesFromOperation(operationContext.operation, document);

            if (body || queryEntries.length > 0 || formDataEntries.length > 0) {
                return {
                    success: true,
                    body: body || undefined,
                    queryEntries,
                    formDataEntries,
                    source: 'swagger-url',
                    swaggerUrl: candidateUrl
                };
            }

            matchedOperationWithoutMockData = true;
        }

        if (matchedOperationWithoutMockData) {
            return {
                success: false,
                message: lang.t('mock.error.swaggerMatchedNoSchema')
            };
        }

        const attemptedSwaggerUrlsText = candidates.length > 0
            ? candidates.join(', ')
            : '(none)';

        return {
            success: false,
            message: lang.t('mock.error.unableToLoadSchema', attemptedSwaggerUrlsText)
        };
    }

    private tryGenerateFromCachedDocument(
        method: string,
        route: string,
        projectPath?: string
    ): { matchedOperation: boolean; result: MockAllResult | null } {
        if (!projectPath) {
            return { matchedOperation: false, result: null };
        }

        const cached = this.swaggerCacheStore.load(projectPath);
        if (!cached?.document || typeof cached.document !== 'object') {
            return { matchedOperation: false, result: null };
        }

        const document = cached.document as OpenApiDocument;
        if (!document.paths || typeof document.paths !== 'object') {
            return { matchedOperation: false, result: null };
        }

        const operationContext = this.findOperationContext(document, method, route);
        if (!operationContext) {
            return { matchedOperation: false, result: null };
        }

        const body = this.tryBuildBodyFromOperation(operationContext.operation, document);
        const queryEntries = this.tryBuildQueryEntriesFromOperation(
            operationContext.operation,
            operationContext.pathItem,
            document
        );
        const formDataEntries = this.tryBuildFormDataEntriesFromOperation(operationContext.operation, document);

        if (!body && queryEntries.length === 0 && formDataEntries.length === 0) {
            return { matchedOperation: true, result: null };
        }

        return {
            matchedOperation: true,
            result: {
                success: true,
                body: body || undefined,
                queryEntries,
                formDataEntries,
                source: 'swagger-cache',
                swaggerUrl: cached.sourceUrl || undefined
            }
        };
    }

    private saveDocumentToProjectCache(projectPath: string | undefined, sourceUrl: string, document: OpenApiDocument): void {
        if (!projectPath || !document || typeof document !== 'object') {
            return;
        }

        this.swaggerCacheStore.save(projectPath, sourceUrl, document as unknown as Record<string, unknown>);
    }

    private buildSwaggerUrlCandidates(baseUrl: string): string[] {
        const normalized = this.normalizeBaseUrl(baseUrl);
        if (!normalized) {
            return [];
        }

        const configuredPath = this.getConfiguredSwaggerPath();
        if (configuredPath) {
            return [this.joinSwaggerUrl(normalized, configuredPath)];
        }

        return [this.joinSwaggerUrl(normalized, '/swagger/v1/swagger.json')];
    }

    private getConfiguredSwaggerPath(): string {
        const configValue = vscode.workspace.getConfiguration('csharpApiConsole').get<unknown>('swaggerJsonPaths');

        // Backward compatibility for legacy array-based setting values.
        if (Array.isArray(configValue)) {
            const firstValid = configValue
                .filter((item): item is string => typeof item === 'string')
                .map(item => item.trim())
                .find(item => item.length > 0);

            return firstValid || '/swagger/v1/swagger.json';
        }

        if (typeof configValue === 'string' && configValue.trim()) {
            return configValue.trim();
        }

        return '/swagger/v1/swagger.json';
    }

    private joinSwaggerUrl(baseUrl: string, swaggerPath: string): string {
        const normalizedPath = swaggerPath.startsWith('/') ? swaggerPath : `/${swaggerPath}`;
        const withCredentials = this.injectSwaggerCredentials(baseUrl);
        return `${withCredentials}${normalizedPath}`;
    }

    private injectSwaggerCredentials(baseUrl: string): string {
        const normalizedBase = this.normalizeBaseUrl(baseUrl);
        if (!normalizedBase) {
            return '';
        }

        const username = this.getSwaggerAuthUsername();
        const password = this.getSwaggerAuthPassword();
        if (!username || !password) {
            return normalizedBase;
        }

        try {
            const parsed = new URL(normalizedBase);
            parsed.username = username;
            parsed.password = password;

            return parsed.toString().replace(/\/$/, '');
        } catch {
            return normalizedBase;
        }
    }

    private getSwaggerAuthUsername(): string {
        const value = vscode.workspace.getConfiguration('csharpApiConsole').get<string>('swaggerAuthUsername');
        return typeof value === 'string' ? value.trim() : '';
    }

    private getSwaggerAuthPassword(): string {
        const value = vscode.workspace.getConfiguration('csharpApiConsole').get<string>('swaggerAuthPassword');
        return typeof value === 'string' ? value.trim() : '';
    }

    private normalizeBaseUrl(baseUrl: string): string {
        const trimmed = (baseUrl || '').trim();
        if (!trimmed) {
            return '';
        }

        return trimmed.replace(/\/+$/, '');
    }

    private async tryFetchOpenApiDocument(url: string): Promise<OpenApiDocument | null> {
        try {
            const body = await this.httpGet(url, OpenApiBodyMockService.swaggerFetchTimeoutMs);
            const parsed = JSON.parse(body) as OpenApiDocument;
            if (!parsed || typeof parsed !== 'object' || !parsed.paths || typeof parsed.paths !== 'object') {
                return null;
            }
            return parsed;
        } catch {
            return null;
        }
    }

    private httpGet(url: string, timeoutMs: number): Promise<string> {
        return new Promise((resolve, reject) => {
            let parsedUrl: URL;
            try {
                parsedUrl = new URL(url);
            } catch {
                reject(new Error(lang.t('mock.error.invalidUrl')));
                return;
            }

            const client = parsedUrl.protocol === 'https:' ? https : http;
            const request = client.get(parsedUrl, response => {
                const statusCode = response.statusCode || 0;
                if (statusCode < 200 || statusCode >= 300) {
                    response.resume();
                    reject(new Error(lang.t('mock.error.httpStatus', String(statusCode))));
                    return;
                }

                const chunks: Buffer[] = [];
                response.on('data', chunk => {
                    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
                });

                response.on('end', () => {
                    resolve(Buffer.concat(chunks).toString('utf8'));
                });
            });

            request.setTimeout(timeoutMs, () => {
                request.destroy(new Error(lang.t('mock.error.requestTimedOut')));
            });

            request.on('error', reject);
        });
    }

    private tryBuildBodyFromOperation(operation: any, doc: OpenApiDocument): string | null {
        const media = this.pickRequestBodyMedia(operation, doc, ['application/json']);
        if (!media) {
            return null;
        }

        const explicitExample = this.extractExplicitExample(media);
        if (explicitExample !== undefined) {
            return JSON.stringify(explicitExample, null, 2);
        }

        const schema = media.schema;
        if (!schema) {
            return null;
        }

        const generated = this.generateValueFromSchema(schema, doc, 0);
        return JSON.stringify(generated, null, 2);
    }

    private tryBuildQueryEntriesFromOperation(operation: any, pathItem: any, doc: OpenApiDocument): MockQueryEntry[] {
        const queryParameters = this.collectQueryParameters(operation, pathItem, doc);
        return queryParameters
            .map(param => this.toMockQueryEntry(param, doc))
            .filter((entry): entry is MockQueryEntry => !!entry);
    }

    private tryBuildFormDataEntriesFromOperation(operation: any, doc: OpenApiDocument): MockFormDataEntry[] {
        const media = this.pickRequestBodyMedia(operation, doc, ['multipart/form-data', 'application/x-www-form-urlencoded']);
        if (!media) {
            return [];
        }

        const explicitExample = this.extractExplicitExample(media);
        if (explicitExample && typeof explicitExample === 'object' && !Array.isArray(explicitExample)) {
            return this.objectToFormDataEntries(explicitExample as Record<string, unknown>);
        }

        const schema = media.schema;
        if (!schema || typeof schema !== 'object') {
            return [];
        }

        const generated = this.generateValueFromSchema(schema, doc, 0);
        if (!generated || typeof generated !== 'object' || Array.isArray(generated)) {
            return [];
        }

        return this.objectToFormDataEntries(generated as Record<string, unknown>);
    }

    private objectToFormDataEntries(source: Record<string, unknown>): MockFormDataEntry[] {
        return Object.entries(source)
            .filter(([key]) => key.trim().length > 0)
            .map(([key, value]) => ({
                key,
                type: 'text' as const,
                value: this.stringifyQueryValue(value)
            }));
    }

    private findOperationContext(
        doc: OpenApiDocument,
        method: string,
        route: string
    ): { operation: any; pathItem: Record<string, any> } | null {
        if (!doc.paths) {
            return null;
        }

        const normalizedMethod = method.toLowerCase();
        const normalizedRoute = this.normalizeRoutePath(route);

        for (const [openApiPath, pathItem] of Object.entries(doc.paths)) {
            if (!pathItem || typeof pathItem !== 'object') {
                continue;
            }

            if (!this.isPathMatch(openApiPath, normalizedRoute)) {
                continue;
            }

            if (normalizedMethod === 'any') {
                const firstWithBody = ['post', 'put', 'patch', 'delete', 'get']
                    .map(key => pathItem[key])
                    .find(op => op && op.requestBody);
                if (firstWithBody) {
                    return {
                        operation: firstWithBody,
                        pathItem
                    };
                }
                continue;
            }

            const op = pathItem[normalizedMethod];
            if (op) {
                return {
                    operation: op,
                    pathItem
                };
            }
        }

        return null;
    }

    private collectQueryParameters(operation: any, pathItem: any, doc: OpenApiDocument): any[] {
        const merged = new Map<string, any>();

        const pushParameter = (parameter: any) => {
            if (!parameter || typeof parameter !== 'object') {
                return;
            }

            const resolved = parameter.$ref ? this.resolveRef(parameter.$ref, doc) : parameter;
            if (!resolved || typeof resolved !== 'object') {
                return;
            }

            if (String(resolved.in || '').toLowerCase() !== 'query') {
                return;
            }

            const name = typeof resolved.name === 'string' ? resolved.name.trim() : '';
            if (!name) {
                return;
            }

            const key = `query:${name.toLowerCase()}`;
            merged.set(key, resolved);
        };

        const pathParameters = Array.isArray(pathItem?.parameters) ? pathItem.parameters : [];
        const operationParameters = Array.isArray(operation?.parameters) ? operation.parameters : [];

        pathParameters.forEach(pushParameter);
        operationParameters.forEach(pushParameter);

        return Array.from(merged.values());
    }

    private toMockQueryEntry(parameter: any, doc: OpenApiDocument): MockQueryEntry | null {
        const key = typeof parameter?.name === 'string' ? parameter.name.trim() : '';
        if (!key) {
            return null;
        }

        if (this.isReadOnlyQueryParameter(parameter, doc)) {
            return null;
        }

        const explicitExample = this.extractExplicitExample(parameter);
        if (explicitExample !== undefined) {
            return {
                key,
                value: this.stringifyQueryValue(explicitExample)
            };
        }

        const schema = parameter?.schema;
        if (!schema || typeof schema !== 'object') {
            return {
                key,
                value: ''
            };
        }

        const generated = this.generateValueFromSchema(schema, doc, 0);
        return {
            key,
            value: this.stringifyQueryValue(generated)
        };
    }

    private isReadOnlyQueryParameter(parameter: any, doc: OpenApiDocument): boolean {
        if (!parameter || typeof parameter !== 'object') {
            return false;
        }

        if (parameter.readOnly === true) {
            return true;
        }

        const schema = parameter.schema;
        if (!schema || typeof schema !== 'object') {
            return false;
        }

        const resolvedSchema = schema.$ref ? this.resolveRef(schema.$ref, doc) : schema;
        return !!resolvedSchema && typeof resolvedSchema === 'object' && resolvedSchema.readOnly === true;
    }

    private stringifyQueryValue(value: unknown): string {
        if (value === undefined || value === null) {
            return '';
        }

        if (typeof value === 'string') {
            return value;
        }

        if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
            return String(value);
        }

        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    private pickRequestBodyMedia(operation: any, doc: OpenApiDocument, preferredMediaTypes?: string[]): any | null {
        const requestBody = operation?.requestBody;
        if (!requestBody || typeof requestBody !== 'object') {
            return null;
        }

        const resolvedRequestBody = requestBody.$ref
            ? this.resolveRef(requestBody.$ref, doc)
            : requestBody;

        const content = resolvedRequestBody?.content;
        if (!content || typeof content !== 'object') {
            return null;
        }

        if (Array.isArray(preferredMediaTypes) && preferredMediaTypes.length > 0) {
            const loweredKeys = Object.keys(content).reduce<Record<string, string>>((acc, key) => {
                acc[key.toLowerCase()] = key;
                return acc;
            }, {});

            for (const preferredType of preferredMediaTypes) {
                const resolvedKey = loweredKeys[preferredType.toLowerCase()];
                if (resolvedKey) {
                    return content[resolvedKey];
                }
            }

            return null;
        }

        if (content['application/json']) {
            return content['application/json'];
        }

        const jsonLikeKey = Object.keys(content).find(key => key.toLowerCase().includes('json'));
        if (jsonLikeKey) {
            return content[jsonLikeKey];
        }

        const firstKey = Object.keys(content)[0];
        return firstKey ? content[firstKey] : null;
    }

    private extractExplicitExample(media: any): unknown {
        if (!media || typeof media !== 'object') {
            return undefined;
        }

        if (media.example !== undefined) {
            return media.example;
        }

        const examples = media.examples;
        if (!examples || typeof examples !== 'object') {
            return undefined;
        }

        const firstExample = Object.values(examples)[0] as { value?: unknown } | undefined;
        if (!firstExample || typeof firstExample !== 'object') {
            return undefined;
        }

        return firstExample.value;
    }

    private generateValueFromSchema(schema: any, doc: OpenApiDocument, depth: number): unknown {
        if (!schema || typeof schema !== 'object') {
            return {};
        }

        if (depth > 10) {
            return {};
        }

        const resolved = schema.$ref ? this.resolveRef(schema.$ref, doc) : schema;
        if (!resolved || typeof resolved !== 'object') {
            return {};
        }

        if (resolved.example !== undefined) {
            return resolved.example;
        }

        if (resolved.default !== undefined) {
            return resolved.default;
        }

        if (Array.isArray(resolved.enum) && resolved.enum.length > 0) {
            return resolved.enum[0];
        }

        if (Array.isArray(resolved.oneOf) && resolved.oneOf.length > 0) {
            return this.generateValueFromSchema(resolved.oneOf[0], doc, depth + 1);
        }

        if (Array.isArray(resolved.anyOf) && resolved.anyOf.length > 0) {
            return this.generateValueFromSchema(resolved.anyOf[0], doc, depth + 1);
        }

        if (Array.isArray(resolved.allOf) && resolved.allOf.length > 0) {
            const merged: Record<string, unknown> = {};
            for (const part of resolved.allOf) {
                const partValue = this.generateValueFromSchema(part, doc, depth + 1);
                if (partValue && typeof partValue === 'object' && !Array.isArray(partValue)) {
                    Object.assign(merged, partValue as Record<string, unknown>);
                }
            }
            return merged;
        }

        const schemaType = typeof resolved.type === 'string' ? resolved.type.toLowerCase() : '';

        if (schemaType === 'string') {
            return '';
        }

        if (schemaType === 'boolean') {
            return false;
        }

        if (schemaType === 'integer' || schemaType === 'number') {
            return 0;
        }

        if (schemaType === 'array') {
            if (!resolved.items) {
                return [];
            }

            return [this.generateValueFromSchema(resolved.items, doc, depth + 1)];
        }

        if (schemaType === 'object' || resolved.properties) {
            const obj: Record<string, unknown> = {};
            const properties = resolved.properties;
            if (properties && typeof properties === 'object') {
                for (const [key, value] of Object.entries(properties)) {
                    if (this.isReadOnlyRequestProperty(value, doc)) {
                        continue;
                    }

                    obj[key] = this.generateValueFromSchema(value, doc, depth + 1);
                }
            }

            return obj;
        }

        return {};
    }

    private isReadOnlyRequestProperty(propertySchema: unknown, doc: OpenApiDocument): boolean {
        if (!propertySchema || typeof propertySchema !== 'object') {
            return false;
        }

        const schemaRecord = propertySchema as Record<string, unknown>;
        const directReadOnly = schemaRecord.readOnly === true;
        if (directReadOnly) {
            return true;
        }

        const refValue = typeof schemaRecord.$ref === 'string' ? schemaRecord.$ref : '';
        if (!refValue) {
            return false;
        }

        const resolved = this.resolveRef(refValue, doc);
        return !!resolved && typeof resolved === 'object' && resolved.readOnly === true;
    }

    private resolveRef(ref: string, doc: OpenApiDocument | undefined): any {
        if (!doc || typeof ref !== 'string' || !ref.startsWith('#/')) {
            return undefined;
        }

        const segments = ref
            .substring(2)
            .split('/')
            .map(item => item.replace(/~1/g, '/').replace(/~0/g, '~'));

        let current: any = doc;
        for (const segment of segments) {
            if (!current || typeof current !== 'object') {
                return undefined;
            }
            current = current[segment];
        }

        return current;
    }

    private isPathMatch(openApiPath: string, route: string): boolean {
        const left = this.normalizeRoutePath(openApiPath);
        const right = this.normalizeRoutePath(route);

        if (left === right) {
            return true;
        }

        const leftSegments = left.split('/').filter(Boolean);
        const rightSegments = right.split('/').filter(Boolean);
        if (leftSegments.length !== rightSegments.length) {
            return false;
        }

        for (let i = 0; i < leftSegments.length; i++) {
            const ls = leftSegments[i];
            const rs = rightSegments[i];

            const isParamSegment = /^\{[^}]+\}$/.test(ls);
            if (isParamSegment) {
                continue;
            }

            if (ls !== rs) {
                return false;
            }
        }

        return true;
    }

    private normalizeRoutePath(value: string): string {
        let normalized = (value || '').trim();
        if (!normalized) {
            return '';
        }

        const queryIndex = normalized.indexOf('?');
        if (queryIndex >= 0) {
            normalized = normalized.substring(0, queryIndex);
        }

        const hashIndex = normalized.indexOf('#');
        if (hashIndex >= 0) {
            normalized = normalized.substring(0, hashIndex);
        }

        if (!normalized.startsWith('/')) {
            normalized = `/${normalized}`;
        }

        normalized = normalized.replace(/\/+/g, '/').toLowerCase();

        if (normalized.length > 1 && normalized.endsWith('/')) {
            normalized = normalized.substring(0, normalized.length - 1);
        }

        return normalized;
    }
}
