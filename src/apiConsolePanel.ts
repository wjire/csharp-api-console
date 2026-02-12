import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ApiEndpoint } from './models/apiEndpoint';
import { ProjectConfigCache } from './projectConfigCache';
import { HttpClient } from './services/httpClient';
import { BaseUrlConfigManager } from './services/baseUrlConfigManager';

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
    private readonly context: vscode.ExtensionContext;
    private currentProjectPath: string = '';

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
        this.context = context;

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

                    // 发送初始化数据
                    this.panel.webview.postMessage({
                        type: 'initialize',
                        data: this.pendingApiEndpoint
                    });

                    // 主动发送 Base URLs（确保 currentProjectPath 已设置）
                    await this.loadBaseUrls();

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
        }
    }

    /**
     * 发送 HTTP 请求
     */
    private async sendHttpRequest(requestData: {
        method: string;
        url: string;
        headers: Record<string, string>;
        body?: string;
    }) {
        // 使用 HttpClient 服务发送请求
        const response = await this.httpClient.sendRequest(requestData);

        // 发送响应到 WebView
        this.panel.webview.postMessage({
            type: 'requestComplete',
            data: response
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

        try {
            const htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
            return htmlContent;
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

        this.panel.dispose();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}