import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ApiEndpoint } from './models/apiEndpoint';
import { ProjectConfigCache } from './projectConfigCache';
import { HttpClient } from './services/httpClient';
import { BaseUrlConfigManager } from './services/baseUrlConfigManager';
import { RequestHistoryStore, RequestHistoryItem } from './services/requestHistoryStore';
import { lang } from './languageManager';
import { LaunchSettingsReader } from './launchSettingsReader';

/**
 * API 控制台面板
 * 管理 WebView 面板，处理 API 测试请求
 */
export class ApiConsolePanel {
    public static currentPanel: ApiConsolePanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];
    private pendingApiEndpoint: ApiEndpoint | null = null;
    private readonly projectConfigCache: ProjectConfigCache;
    private readonly httpClient: HttpClient;
    private readonly baseUrlConfigManager: BaseUrlConfigManager;
    private readonly requestHistoryStore: RequestHistoryStore;
    private readonly context: vscode.ExtensionContext;
    private currentProjectPath: string = '';
    private currentApiEndpoint: ApiEndpoint | null = null;
    private static readonly DEBUG_SESSION_PREFIX = 'C# API Console';
    private static readonly runningProjectPaths = new Set<string>();
    private static readonly openPanels = new Set<ApiConsolePanel>();

    public static onDebugSessionStarted(session: vscode.DebugSession): void {
        const config = session.configuration as { projectPath?: string };
        if (!config.projectPath) {
            return;
        }

        const normalizedProjectPath = ApiConsolePanel.normalizeProjectPath(config.projectPath);
        ApiConsolePanel.runningProjectPaths.add(normalizedProjectPath);

        for (const panel of ApiConsolePanel.openPanels) {
            if (panel.matchesProjectPath(config.projectPath)) {
                panel.postDebugStatus('running');
            }
        }
    }

    public static onDebugSessionTerminated(session: vscode.DebugSession): void {
        const config = session.configuration as { projectPath?: string };
        if (!config.projectPath) {
            return;
        }

        const normalizedProjectPath = ApiConsolePanel.normalizeProjectPath(config.projectPath);
        ApiConsolePanel.runningProjectPaths.delete(normalizedProjectPath);

        for (const panel of ApiConsolePanel.openPanels) {
            if (panel.matchesProjectPath(config.projectPath)) {
                panel.postDebugStatus('idle');
            }
        }
    }

    /**
     * 创建或显示测试面板
     * 每次都创建新的标签页
     */
    public static createOrShow(
        extensionUri: vscode.Uri,
        apiEndpoint: ApiEndpoint,
        projectConfigCache: ProjectConfigCache,
        baseUrlConfigManager: BaseUrlConfigManager,
        context: vscode.ExtensionContext
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // 每次都创建新面板，支持多个测试标签
        const panel = vscode.window.createWebviewPanel(
            'apiConsolePanel',
            // `⚡ ${apiEndpoint.httpMethod} ${apiEndpoint.routeTemplate}`,
            `⚡ ${apiEndpoint.action || apiEndpoint.routeTemplate}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'webview')
                ]
            }
        );

        // 设置标签页图标为debug图标  
        panel.iconPath = new vscode.ThemeIcon('debug');

        // 创建新实例（不再复用 currentPanel）
        new ApiConsolePanel(panel, extensionUri, apiEndpoint, projectConfigCache, baseUrlConfigManager, context);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        apiEndpoint: ApiEndpoint,
        projectConfigCache: ProjectConfigCache,
        baseUrlConfigManager: BaseUrlConfigManager,
        context: vscode.ExtensionContext
    ) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.pendingApiEndpoint = apiEndpoint;
        this.projectConfigCache = projectConfigCache;
        this.httpClient = new HttpClient();
        this.baseUrlConfigManager = baseUrlConfigManager;
        this.requestHistoryStore = new RequestHistoryStore(context);
        this.context = context;
        ApiConsolePanel.openPanels.add(this);

        // 加载静态 HTML 内容
        this.panel.webview.html = this.getStaticHtml();

        // 监听面板关闭事件
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // 处理来自 WebView 的消息
        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            null,
            this.disposables
        );
    }

    /**
     * 处理来自 WebView 的消息
     */
    private async handleMessage(message: any) {
        switch (message.type) {
            case 'webviewReady':
                // WebView 已准备好，发送初始化数据
                if (this.pendingApiEndpoint) {
                    // 性能优化：延迟加载项目配置
                    // 仅在用户点击测试按钮时才查找项目文件和读取配置
                    await this.enrichApiEndpoint(this.pendingApiEndpoint);

                    // 保存当前项目路径
                    this.currentProjectPath = this.pendingApiEndpoint.projectPath || '';
                    this.currentApiEndpoint = { ...this.pendingApiEndpoint };

                    // 发送初始化数据
                    this.panel.webview.postMessage({
                        type: 'initialize',
                        data: this.pendingApiEndpoint
                    });

                    // 发送语言文本
                    this.panel.webview.postMessage({
                        type: 'i18n',
                        data: lang.getWebViewTexts()
                    });

                    // 发送渲染配置
                    this.panel.webview.postMessage({
                        type: 'renderSettings',
                        data: this.getRenderSettings()
                    });

                    // 主动发送 Base URLs（确保 currentProjectPath 已设置）
                    await this.loadBaseUrls();

                    // 加载当前接口历史记录
                    await this.loadRequestHistory();

                    // 同步当前项目调试状态
                    this.postDebugStatus(this.isCurrentProjectDebugRunning() ? 'running' : 'idle');

                    this.pendingApiEndpoint = null;
                }
                break;
            case 'sendRequest':
                await this.sendHttpRequest(message.data);
                break;
            case 'requestBaseUrls':
                await this.loadBaseUrls();
                break;
            case 'saveBaseUrls':
                await this.saveBaseUrls(message.data);
                break;
            case 'startDebug':
                await this.startDebugSession();
                break;
            case 'clearRequestHistory':
                await this.clearRequestHistory();
                break;
        }
    }

    /**
     * 启动调试会话（携带 launchSettings.json 环境变量）
     */
    private async startDebugSession(): Promise<void> {
        if (!this.currentProjectPath) {
            this.postDebugStatus('error', lang.t('webview.debug.noProject'));
            return;
        }

        if (this.isCurrentProjectDebugRunning()) {
            this.postDebugStatus('running', lang.t('webview.debug.alreadyRunning'));
            return;
        }

        this.postDebugStatus('starting');

        const env = LaunchSettingsReader.getEnvironmentVariables(this.currentProjectPath);
        const workspaceFolder = this.getWorkspaceFolderForCurrentProject();
        const normalizedProjectPath = ApiConsolePanel.normalizeProjectPath(this.currentProjectPath);
        const projectName = this.getProjectNameFromPath(this.currentProjectPath);
        const debugName = projectName
            ? `${projectName} Debug`
            : `${ApiConsolePanel.DEBUG_SESSION_PREFIX} Debug`;

        const debugConfiguration: vscode.DebugConfiguration = {
            name: debugName,
            type: 'dotnet',
            request: 'launch',
            projectPath: this.currentProjectPath,
            env
        };

        try {
            const started = await vscode.debug.startDebugging(workspaceFolder, debugConfiguration);

            if (!started) {
                this.postDebugStatus('error', lang.t('webview.debug.failed'));
                return;
            }

            ApiConsolePanel.runningProjectPaths.add(normalizedProjectPath);

            this.postDebugStatus('running', lang.t('webview.debug.started'));
        } catch (error) {
            const message = error instanceof Error && error.message
                ? `${lang.t('webview.debug.failed')}: ${error.message}`
                : lang.t('webview.debug.failed');

            this.postDebugStatus('error', message);
        }
    }

    /**
     * 回传调试状态到 WebView
     */
    private postDebugStatus(status: 'idle' | 'starting' | 'running' | 'error', message?: string): void {
        this.panel.webview.postMessage({
            type: 'debugStatus',
            data: {
                status,
                message
            }
        });
    }

    /**
     * 获取当前项目对应的工作区文件夹
     */
    private getWorkspaceFolderForCurrentProject(): vscode.WorkspaceFolder | undefined {
        if (!this.currentProjectPath) {
            return vscode.workspace.workspaceFolders?.[0];
        }

        return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(this.currentProjectPath))
            ?? vscode.workspace.workspaceFolders?.[0];
    }

    /**
     * 判断调试会话是否属于当前面板对应项目
     */
    private isCurrentProjectDebugSession(session: vscode.DebugSession): boolean {
        const config = session.configuration as { name?: string; projectPath?: string };
        if (!config.projectPath || !this.currentProjectPath) {
            return false;
        }

        return ApiConsolePanel.normalizeProjectPath(config.projectPath) === ApiConsolePanel.normalizeProjectPath(this.currentProjectPath);
    }

    /**
     * 判断当前项目是否已在运行调试会话
     */
    private isCurrentProjectDebugRunning(): boolean {
        if (!this.currentProjectPath) {
            return false;
        }

        return ApiConsolePanel.runningProjectPaths.has(ApiConsolePanel.normalizeProjectPath(this.currentProjectPath));
    }

    /**
     * 规范化项目路径（Windows 下统一小写以避免大小写差异）
     */
    private static normalizeProjectPath(projectPath: string): string {
        return path.normalize(projectPath).toLowerCase();
    }

    private matchesProjectPath(projectPath: string): boolean {
        if (!this.currentProjectPath) {
            return false;
        }

        return ApiConsolePanel.normalizeProjectPath(projectPath) === ApiConsolePanel.normalizeProjectPath(this.currentProjectPath);
    }

    /**
     * 从 .csproj 路径提取项目名
     */
    private getProjectNameFromPath(projectPath: string): string {
        const ext = path.extname(projectPath);
        return path.basename(projectPath, ext).trim();
    }

    /**
     * 发送 HTTP 请求
     */
    private async sendHttpRequest(requestData: {
        method: string;
        url: string;
        headers: Record<string, string>;
        body?: string;
        path?: string;
        query?: string;
        bodyMode?: 'json' | 'formdata' | 'binary';
        binaryBodyBase64?: string;
        binaryContentType?: string;
        binaryFileName?: string;
        formDataFields?: Array<{
            key: string;
            type: 'text' | 'file';
            value?: string;
            valueBase64?: string;
            fileName?: string;
            contentType?: string;
        }>;
    }) {
        // 使用 HttpClient 服务发送请求
        const response = await this.httpClient.sendRequest({
            ...requestData,
            timeoutMs: this.getRequestTimeoutMs()
        });

        await this.saveRequestHistory(requestData, response);

        // 发送响应到 WebView
        this.panel.webview.postMessage({
            type: 'requestComplete',
            data: response
        });

        await this.loadRequestHistory();
    }

    private getHistoryLimit(): number {
        const configuredLimit = vscode.workspace
            .getConfiguration('csharpApiConsole')
            .get<number>('requestHistoryLimit', 10);

        if (!Number.isFinite(configuredLimit)) {
            return 10;
        }

        return Math.min(20, Math.max(1, Math.floor(configuredLimit)));
    }

    private getRequestTimeoutMs(): number {
        const timeoutSeconds = vscode.workspace
            .getConfiguration('csharpApiConsole')
            .get<number>('requestTimeoutSeconds', 30);

        if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
            return 30000;
        }

        return Math.floor(timeoutSeconds * 1000);
    }

    private getRenderSettings(): { largeResponseThresholdBytes: number; maxResponseLineNumbers: number } {
        const config = vscode.workspace.getConfiguration('csharpApiConsole');
        const thresholdKb = config.get<number>('largeResponseThresholdKb', 1024);
        const maxLineNumbers = config.get<number>('maxResponseLineNumbers', 2000);

        const safeThresholdKb = Number.isFinite(thresholdKb) && thresholdKb > 0 ? thresholdKb : 1024;
        const safeMaxLineNumbers = Number.isFinite(maxLineNumbers) && maxLineNumbers > 0
            ? Math.floor(maxLineNumbers)
            : 2000;

        return {
            largeResponseThresholdBytes: Math.floor(safeThresholdKb * 1024),
            maxResponseLineNumbers: safeMaxLineNumbers
        };
    }

    private getRequestHistoryMaxBodyBytes(): number {
        const maxBodyKb = vscode.workspace
            .getConfiguration('csharpApiConsole')
            .get<number>('requestHistoryMaxBodyKb', 32);

        if (!Number.isFinite(maxBodyKb) || maxBodyKb <= 0) {
            return 32 * 1024;
        }

        return Math.floor(maxBodyKb * 1024);
    }

    private isRequestHistoryEnabled(): boolean {
        return vscode.workspace
            .getConfiguration('csharpApiConsole')
            .get<boolean>('requestHistoryEnabled', true);
    }

    private getCurrentEndpointKey(fallbackMethod?: string): string | null {
        if (this.currentApiEndpoint) {
            const projectPath = this.currentApiEndpoint.projectPath
                ? ApiConsolePanel.normalizeProjectPath(this.currentApiEndpoint.projectPath)
                : '';
            return `${projectPath}|${this.currentApiEndpoint.httpMethod}|${this.currentApiEndpoint.routeTemplate}`;
        }

        if (!fallbackMethod) {
            return null;
        }

        return `fallback|${fallbackMethod.toUpperCase()}`;
    }

    private extractPathAndQuery(url: string, pathFromRequest?: string, queryFromRequest?: string): { path: string; query: string } {
        const fallbackPath = pathFromRequest && pathFromRequest.trim().length > 0
            ? pathFromRequest.trim()
            : '/';
        const fallbackQuery = queryFromRequest?.trim() || '';

        try {
            const parsedUrl = new URL(url);
            const query = parsedUrl.search ? parsedUrl.search.substring(1) : fallbackQuery;
            return {
                path: fallbackPath || parsedUrl.pathname || '/',
                query
            };
        } catch {
            return {
                path: fallbackPath,
                query: fallbackQuery
            };
        }
    }

    private sanitizeQuery(query: string): string {
        if (!query) {
            return '';
        }

        const sensitiveKeyPattern = /^(authorization|cookie|set-cookie|token)$/i;

        try {
            const params = new URLSearchParams(query);
            const sanitized = new URLSearchParams();

            params.forEach((value, key) => {
                if (sensitiveKeyPattern.test(key)) {
                    sanitized.append(key, '***');
                } else {
                    sanitized.append(key, value);
                }
            });

            return sanitized.toString();
        } catch {
            return query;
        }
    }

    private sanitizeBody(body: string): string {
        if (!body) {
            return '';
        }

        const sensitiveKeyPattern = /token/i;

        try {
            const parsed = JSON.parse(body);
            const sanitizeObject = (value: unknown): unknown => {
                if (Array.isArray(value)) {
                    return value.map(item => sanitizeObject(item));
                }

                if (value && typeof value === 'object') {
                    const record = value as Record<string, unknown>;
                    const next: Record<string, unknown> = {};
                    Object.entries(record).forEach(([key, innerValue]) => {
                        next[key] = sensitiveKeyPattern.test(key)
                            ? '***'
                            : sanitizeObject(innerValue);
                    });
                    return next;
                }

                return value;
            };

            return JSON.stringify(sanitizeObject(parsed), null, 2);
        } catch {
            return body.replace(/("[^"]*token[^"]*"\s*:\s*")([^"]*)(")/ig, '$1***$3');
        }
    }

    private async saveRequestHistory(
        requestData: {
            method: string;
            url: string;
            body?: string;
            path?: string;
            query?: string;
        },
        response: {
            statusCode?: number;
        }
    ): Promise<void> {
        if (!this.isRequestHistoryEnabled()) {
            return;
        }

        const { query: rawQuery } = this.extractPathAndQuery(
            requestData.url,
            requestData.path,
            requestData.query
        );
        const endpointKey = this.getCurrentEndpointKey(requestData.method);
        if (!endpointKey) {
            return;
        }

        const query = this.sanitizeQuery(rawQuery);
        const sanitizedBody = this.sanitizeBody(requestData.body || '');
        const maxBodyBytes = this.getRequestHistoryMaxBodyBytes();
        const body = Buffer.byteLength(sanitizedBody, 'utf8') > maxBodyBytes
            ? ''
            : sanitizedBody;

        const item: RequestHistoryItem = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            query,
            body,
            timestamp: Date.now(),
            statusCode: typeof response.statusCode === 'number' ? response.statusCode : null
        };

        await this.requestHistoryStore.addHistory(endpointKey, item, this.getHistoryLimit());
    }

    private async loadRequestHistory(): Promise<void> {
        if (!this.isRequestHistoryEnabled()) {
            this.panel.webview.postMessage({
                type: 'requestHistoryLoaded',
                data: []
            });
            return;
        }

        const endpointKey = this.getCurrentEndpointKey();
        if (!endpointKey) {
            this.panel.webview.postMessage({
                type: 'requestHistoryLoaded',
                data: []
            });
            return;
        }

        const history = await this.requestHistoryStore.getHistory(endpointKey);
        this.panel.webview.postMessage({
            type: 'requestHistoryLoaded',
            data: history
        });
    }

    private async clearRequestHistory(): Promise<void> {
        if (!this.isRequestHistoryEnabled()) {
            this.panel.webview.postMessage({
                type: 'requestHistoryLoaded',
                data: []
            });
            return;
        }

        const endpointKey = this.getCurrentEndpointKey();
        if (!endpointKey) {
            return;
        }

        await this.requestHistoryStore.clearEndpointHistory(endpointKey);
        this.panel.webview.postMessage({
            type: 'requestHistoryLoaded',
            data: []
        });
    }

    /**
     * 补充 API 端点的完整信息（延迟加载 + 两层缓存）
     */
    private async enrichApiEndpoint(apiEndpoint: ApiEndpoint): Promise<void> {
        // 每次都重新获取 Base URL（缓存会处理性能问题）
        // 这样可以确保 launchSettings.json 修改后立即生效

        try {
            // 使用缓存获取 Base URL（两层缓存 + 文件监听）
            const baseUrl = await this.projectConfigCache.getBaseUrl(apiEndpoint.filePath);
            apiEndpoint.fullUrl = baseUrl ? `${baseUrl}${apiEndpoint.routeTemplate}` : apiEndpoint.routeTemplate;
        } catch (error) {
            console.error('[ApiConsolePanel] Failed to enrich API endpoint:', error);
            // 失败时使用路由模板作为 fallback
            apiEndpoint.fullUrl = apiEndpoint.routeTemplate;
        }
    }

    /**
     * 获取静态 HTML 内容
     */
    private getStaticHtml(): string {
        const htmlPath = vscode.Uri.joinPath(this.extensionUri, 'webview', 'api-console.html');
        const styleUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'webview', 'api-console.css')
        );
        const scriptUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'webview', 'api-console.js')
        );

        try {
            const htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
            return htmlContent
                .replace('{{STYLE_URI}}', styleUri.toString())
                .replace('{{SCRIPT_URI}}', scriptUri.toString());
        } catch (error) {
            console.error('Failed to load static HTML:', error);
            return `<!DOCTYPE html>
            <html>
            <body>
                <h1>Error loading API test panel</h1>
                <p>${error}</p>
            </body>
            </html>`;
        }
    }

    /**
     * 加载保存的 Base URLs（从内存中读取）
     */
    private async loadBaseUrls() {
        if (!this.currentProjectPath) {
            this.panel.webview.postMessage({
                type: 'loadBaseUrls',
                data: []
            });
            return;
        }

        const projectBaseUrls = this.baseUrlConfigManager.getBaseUrls(this.currentProjectPath);

        this.panel.webview.postMessage({
            type: 'loadBaseUrls',
            data: projectBaseUrls
        });
    }

    /**
     * 保存 Base URLs（同步更新内存，异步写入文件）
     */
    private async saveBaseUrls(baseUrls: string[]) {
        if (!this.currentProjectPath) {
            return;
        }

        this.baseUrlConfigManager.saveBaseUrls(this.currentProjectPath, baseUrls);
    }

    /**
     * 释放资源
     */
    public dispose() {
        ApiConsolePanel.currentPanel = undefined;
        ApiConsolePanel.openPanels.delete(this);

        // 清理 HttpClient 资源（如果有的话）
        if (this.httpClient && typeof (this.httpClient as any).dispose === 'function') {
            (this.httpClient as any).dispose();
        }

        this.panel.dispose();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}