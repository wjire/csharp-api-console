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

export interface OpenApiConsolePanelInfo {
    id: string;
    endpointKey: string;
    title: string;
    fullUrl: string;
    method: string;
    route: string;
    action: string;
    projectPath: string;
    isPinned: boolean;
    isVisible: boolean;
    isActive: boolean;
    debugStatus: 'idle' | 'running';
    createdOrder: number;
}

/**
 * API 控制台面板
 * 管理 WebView 面板，处理 API 测试请求
 */
export class ApiConsolePanel {
    public static currentPanel: ApiConsolePanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly viewType: string;
    private readonly extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];
    private pendingApiEndpoint: ApiEndpoint | null = null;
    private isWebviewReady = false;
    private readonly projectConfigCache: ProjectConfigCache;
    private readonly httpClient: HttpClient;
    private readonly baseUrlConfigManager: BaseUrlConfigManager;
    private readonly requestHistoryStore: RequestHistoryStore;
    private readonly context: vscode.ExtensionContext;
    private readonly panelId: number;
    private currentProjectPath: string = '';
    private currentApiEndpoint: ApiEndpoint | null = null;
    private endpointKey: string;
    private tabPinned = false;
    private static readonly DEBUG_SESSION_PREFIX = 'C# API Console';
    private static readonly runningProjectPaths = new Set<string>();
    private static readonly openPanels = new Set<ApiConsolePanel>();
    private static readonly panelByEndpointKey = new Map<string, ApiConsolePanel>();
    private static readonly panelById = new Map<string, ApiConsolePanel>();
    private static readonly onDidPanelsChangedEmitter = new vscode.EventEmitter<void>();
    public static readonly onDidPanelsChanged = ApiConsolePanel.onDidPanelsChangedEmitter.event;
    private static panelCounter = 0;

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

        ApiConsolePanel.onDidPanelsChangedEmitter.fire();
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

        ApiConsolePanel.onDidPanelsChangedEmitter.fire();
    }

    public static syncTabPinnedStates(): void {
        for (const panel of ApiConsolePanel.openPanels) {
            panel.syncPinnedStateFromTab();
        }

        ApiConsolePanel.onDidPanelsChangedEmitter.fire();
    }

    public static getOpenPanelInfos(): OpenApiConsolePanelInfo[] {
        const panels = Array.from(ApiConsolePanel.openPanels)
            .map(panel => panel.getPanelInfo())
            .sort((a, b) => a.createdOrder - b.createdOrder);

        return panels;
    }

    public static revealPanelById(panelId: string): boolean {
        const panel = ApiConsolePanel.panelById.get(panelId);
        if (!panel) {
            return false;
        }

        panel.reveal(vscode.ViewColumn.Active);
        ApiConsolePanel.currentPanel = panel;
        ApiConsolePanel.onDidPanelsChangedEmitter.fire();
        return true;
    }

    /**
     * 创建或显示测试面板
      * 同一接口：未固定则跳转复用，已固定则新建
     */
    public static async createOrShow(
        extensionUri: vscode.Uri,
        apiEndpoint: ApiEndpoint,
        projectConfigCache: ProjectConfigCache,
        baseUrlConfigManager: BaseUrlConfigManager,
        context: vscode.ExtensionContext
    ): Promise<void> {
        const endpointForPanel: ApiEndpoint = { ...apiEndpoint };
        await ApiConsolePanel.enrichEndpointFullUrl(endpointForPanel, projectConfigCache);

        const endpointKey = ApiConsolePanel.getEndpointKey(endpointForPanel);
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const existingPanel = ApiConsolePanel.panelByEndpointKey.get(endpointKey);
        if (existingPanel) {
            existingPanel.reveal(column);

            if (!existingPanel.shouldOpenNewForSameEndpoint()) {
                ApiConsolePanel.currentPanel = existingPanel;
                ApiConsolePanel.onDidPanelsChangedEmitter.fire();
                return;
            }
        }

        const panelId = ++ApiConsolePanel.panelCounter;
        const viewType = `apiConsolePanel.${panelId}`;

        const panel = vscode.window.createWebviewPanel(
            viewType,
            ApiConsolePanel.getPanelTitle(endpointForPanel),
            {
                viewColumn: column || vscode.ViewColumn.One,
                preserveFocus: false
            },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'webview')
                ]
            }
        );

        // Use a fixed yellow icon file so the tab icon color is not overridden by theme.
        panel.iconPath = {
            light: vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'zap-yellow.svg'),
            dark: vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'zap-yellow.svg')
        };

        const newPanel = new ApiConsolePanel(
            panel,
            panelId,
            viewType,
            extensionUri,
            endpointForPanel,
            endpointKey,
            projectConfigCache,
            baseUrlConfigManager,
            context
        );

        ApiConsolePanel.currentPanel = newPanel;
        ApiConsolePanel.panelByEndpointKey.set(endpointKey, newPanel);
    }

    private static async enrichEndpointFullUrl(
        apiEndpoint: ApiEndpoint,
        projectConfigCache: ProjectConfigCache
    ): Promise<void> {
        try {
            const baseUrl = await projectConfigCache.getBaseUrl(apiEndpoint.filePath);
            apiEndpoint.fullUrl = baseUrl
                ? `${baseUrl}${apiEndpoint.routeTemplate}`
                : apiEndpoint.routeTemplate;
        } catch (error) {
            console.error('[ApiConsolePanel] Failed to pre-enrich API endpoint:', error);
            apiEndpoint.fullUrl = apiEndpoint.routeTemplate;
        }
    }

    private constructor(
        panel: vscode.WebviewPanel,
        panelId: number,
        viewType: string,
        extensionUri: vscode.Uri,
        apiEndpoint: ApiEndpoint,
        endpointKey: string,
        projectConfigCache: ProjectConfigCache,
        baseUrlConfigManager: BaseUrlConfigManager,
        context: vscode.ExtensionContext
    ) {
        this.panel = panel;
        this.panelId = panelId;
        this.viewType = viewType;
        this.extensionUri = extensionUri;
        this.pendingApiEndpoint = apiEndpoint;
        this.endpointKey = endpointKey;
        this.projectConfigCache = projectConfigCache;
        this.httpClient = new HttpClient();
        this.baseUrlConfigManager = baseUrlConfigManager;
        this.requestHistoryStore = new RequestHistoryStore(context);
        this.context = context;
        ApiConsolePanel.openPanels.add(this);
        ApiConsolePanel.panelById.set(String(this.panelId), this);
        ApiConsolePanel.onDidPanelsChangedEmitter.fire();

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

    private static getPanelTitle(apiEndpoint: ApiEndpoint): string {
        const route = (apiEndpoint.routeTemplate || '').trim();
        const routeWithoutLeadingSlash = route.replace(/^\/+/, '');

        if (routeWithoutLeadingSlash.length > 0) {
            return routeWithoutLeadingSlash;
        }

        if (route.length > 0) {
            return route;
        }

        return (apiEndpoint.action || '').trim() || 'API';
    }

    private static getEndpointKey(apiEndpoint: ApiEndpoint): string {
        const method = (apiEndpoint.httpMethod || '').trim().toUpperCase();
        const route = (apiEndpoint.routeTemplate || '').trim();
        const action = (apiEndpoint.action || '').trim();
        const projectPath = ApiConsolePanel.normalizeProjectPath(apiEndpoint.projectPath || '');

        return `${projectPath}::${method}::${route}::${action}`;
    }

    private getPanelInfo(): OpenApiConsolePanelInfo {
        this.syncPinnedStateFromTab();

        const endpoint = this.currentApiEndpoint || this.pendingApiEndpoint;
        const method = (endpoint?.httpMethod || '').toUpperCase();
        const route = endpoint?.routeTemplate || '';
        const fullUrl = endpoint?.fullUrl || '';
        const action = endpoint?.action || '';
        const projectPath = endpoint?.projectPath || this.currentProjectPath;
        const normalizedProjectPath = projectPath
            ? ApiConsolePanel.normalizeProjectPath(projectPath)
            : '';

        return {
            id: String(this.panelId),
            endpointKey: this.endpointKey,
            title: this.panel.title,
            fullUrl,
            method,
            route,
            action,
            projectPath,
            isPinned: this.tabPinned,
            isVisible: this.panel.visible,
            isActive: ApiConsolePanel.currentPanel === this,
            debugStatus: normalizedProjectPath && ApiConsolePanel.runningProjectPaths.has(normalizedProjectPath)
                ? 'running'
                : 'idle',
            createdOrder: this.panelId
        };
    }

    /**
     * 处理来自 WebView 的消息
     */
    private async handleMessage(message: any) {
        switch (message.type) {
            case 'webviewReady':
                this.isWebviewReady = true;
                if (this.pendingApiEndpoint) {
                    await this.applyEndpoint(this.pendingApiEndpoint, 'initialize');
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
            case 'openResponseInEditor':
                await this.openResponseInEditor(message.data?.content);
                break;
        }
    }

    private async openResponseInEditor(content: unknown): Promise<void> {
        const responseText = typeof content === 'string' ? content : String(content ?? '');
        if (!responseText) {
            return;
        }

        try {
            await vscode.env.clipboard.writeText(responseText);

            const document = await vscode.workspace.openTextDocument({
                language: this.detectResponseLanguage(responseText),
                content: responseText
            });

            await vscode.window.showTextDocument(document, {
                preview: false,
                preserveFocus: false
            });
        } catch (error) {
            const detail = error instanceof Error && error.message
                ? `: ${error.message}`
                : '';
            void vscode.window.showErrorMessage(`${lang.t('webview.error.requestFailed')}${detail}`);
        }
    }

    private detectResponseLanguage(responseText: string): string {
        const trimmed = responseText.trim();
        if (!trimmed) {
            return 'plaintext';
        }

        try {
            JSON.parse(trimmed);
            return 'json';
        } catch {
            return 'plaintext';
        }
    }

    private async applyEndpoint(apiEndpoint: ApiEndpoint, messageType: 'initialize' | 'updateApiEndpoint'): Promise<void> {
        await this.enrichApiEndpoint(apiEndpoint);

        this.currentProjectPath = apiEndpoint.projectPath || '';
        this.currentApiEndpoint = { ...apiEndpoint };

        this.panel.webview.postMessage({
            type: messageType,
            data: apiEndpoint
        });

        this.panel.webview.postMessage({
            type: 'i18n',
            data: lang.getWebViewTexts()
        });

        this.panel.webview.postMessage({
            type: 'renderSettings',
            data: this.getRenderSettings()
        });

        await this.loadBaseUrls();
        await this.loadRequestHistory();
        this.postDebugStatus(this.isCurrentProjectDebugRunning() ? 'running' : 'idle');
    }

    private reveal(column: vscode.ViewColumn | undefined): void {
        this.panel.reveal(column, false);
    }

    private shouldOpenNewForSameEndpoint(): boolean {
        this.syncPinnedStateFromTab();
        return this.tabPinned;
    }

    private syncPinnedStateFromTab(): void {
        const tab = this.findTabByViewType();
        if (!tab) {
            return;
        }

        // 在部分 VS Code 版本中 Webview 标签即使未固定也可能 isPreview=false，
        // 因此仅以 isPinned 作为“已固定”判定，避免误判后始终新开。
        this.tabPinned = tab.isPinned;
    }

    private findTabByViewType(): vscode.Tab | undefined {
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                const input = tab.input as { viewType?: unknown } | undefined;
                const runtimeViewType = typeof input?.viewType === 'string' ? input.viewType : undefined;
                if (!runtimeViewType) {
                    continue;
                }

                if (
                    runtimeViewType === this.viewType ||
                    runtimeViewType.endsWith(`-${this.viewType}`) ||
                    runtimeViewType.endsWith(this.viewType)
                ) {
                    return tab;
                }
            }
        }

        return undefined;
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
        const targetFrameworks = this.getTargetFrameworksFromProject(this.currentProjectPath);
        const selectedFramework = this.selectPreferredTargetFramework(targetFrameworks);

        const debugConfiguration: vscode.DebugConfiguration = this.shouldUseCoreClrDebug(selectedFramework)
            ? this.createCoreClrDebugConfiguration(debugName, this.currentProjectPath, env, selectedFramework)
            : {
                name: debugName,
                type: 'dotnet',
                request: 'launch',
                projectPath: this.currentProjectPath,
                env
            };

        if (debugConfiguration.type === 'coreclr') {
            this.postDebugStatus('starting', lang.t('webview.debug.building'));

            const buildSucceeded = await this.buildProjectForCoreClr(this.currentProjectPath, selectedFramework);
            if (!buildSucceeded) {
                this.postDebugStatus('error', lang.t('webview.debug.buildFailed'));
                return;
            }

            const programPath = typeof debugConfiguration.program === 'string'
                ? debugConfiguration.program
                : '';

            if (!programPath || !fs.existsSync(programPath)) {
                const frameworkText = selectedFramework ? `（${selectedFramework}）` : '';
                const message = lang.t('webview.debug.buildDebugFirst', frameworkText, programPath || 'unknown');
                this.postDebugStatus('error', message);
                return;
            }

            this.postDebugStatus('starting');
        }

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
     * coreclr 启动前执行 Debug 构建（按选中的目标框架）
     */
    private async buildProjectForCoreClr(projectPath: string, targetFramework: string | undefined): Promise<boolean> {
        try {
            const workspaceFolder = this.getWorkspaceFolderForCurrentProject();
            const projectDir = path.dirname(projectPath);
            const projectName = this.getProjectNameFromPath(projectPath) || 'Project';
            const args = ['build', projectPath, '-c', 'Debug'];

            if (targetFramework) {
                args.push('-f', targetFramework);
            }

            const buildTask = new vscode.Task(
                { type: 'process', task: 'buildCoreClrDebug' },
                workspaceFolder ?? vscode.TaskScope.Workspace,
                `${projectName} Build Debug`,
                'C# API Console',
                new vscode.ProcessExecution('dotnet', args, { cwd: projectDir }),
                '$msCompile'
            );

            const execution = await vscode.tasks.executeTask(buildTask);

            const exitCode = await new Promise<number | undefined>((resolve) => {
                const disposable = vscode.tasks.onDidEndTaskProcess((event) => {
                    if (event.execution === execution) {
                        disposable.dispose();
                        resolve(event.exitCode);
                    }
                });
            });

            return exitCode === 0;
        } catch {
            return false;
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
     * 从 csproj 读取目标框架列表（支持 TargetFramework / TargetFrameworks）
     */
    private getTargetFrameworksFromProject(projectPath: string): string[] {
        try {
            if (!fs.existsSync(projectPath)) {
                return [];
            }

            const content = fs.readFileSync(projectPath, 'utf8');
            const tfmMatch = content.match(/<TargetFramework>\s*([^<\s]+)\s*<\/TargetFramework>/i);
            if (tfmMatch && tfmMatch[1]) {
                return [tfmMatch[1].trim()];
            }

            const tfmsMatch = content.match(/<TargetFrameworks>\s*([^<]+)\s*<\/TargetFrameworks>/i);
            if (!tfmsMatch || !tfmsMatch[1]) {
                return [];
            }

            return tfmsMatch[1]
                .split(';')
                .map(item => item.trim())
                .filter(item => item.length > 0);
        } catch {
            return [];
        }
    }

    /**
     * 选择用于调试的首选目标框架：优先 net5+，其次 netcoreapp，最后回退为列表首项
     */
    private selectPreferredTargetFramework(targetFrameworks: string[]): string | undefined {
        if (!targetFrameworks || targetFrameworks.length === 0) {
            return undefined;
        }

        const modernNet = targetFrameworks
            .map(tfm => ({ tfm, version: this.parseNetVersion(tfm, 'net') }))
            .filter(item => item.version && item.version.major >= 5)
            .sort((a, b) => {
                const majorDelta = (b.version?.major ?? 0) - (a.version?.major ?? 0);
                if (majorDelta !== 0) {
                    return majorDelta;
                }
                return (b.version?.minor ?? 0) - (a.version?.minor ?? 0);
            });

        if (modernNet.length > 0) {
            return modernNet[0].tfm;
        }

        const netCoreApp = targetFrameworks
            .map(tfm => ({ tfm, version: this.parseNetVersion(tfm, 'netcoreapp') }))
            .filter(item => item.version)
            .sort((a, b) => {
                const majorDelta = (b.version?.major ?? 0) - (a.version?.major ?? 0);
                if (majorDelta !== 0) {
                    return majorDelta;
                }
                return (b.version?.minor ?? 0) - (a.version?.minor ?? 0);
            });

        if (netCoreApp.length > 0) {
            return netCoreApp[0].tfm;
        }

        return targetFrameworks[0];
    }

    /**
     * 根据目标框架自动选择调试器：net5+ 使用 dotnet，其余回退 coreclr
     */
    private shouldUseCoreClrDebug(targetFramework: string | undefined): boolean {
        if (!targetFramework) {
            return false;
        }

        const netVersion = this.parseNetVersion(targetFramework, 'net');
        if (netVersion && netVersion.major >= 5) {
            return false;
        }

        return true;
    }

    private createCoreClrDebugConfiguration(
        debugName: string,
        projectPath: string,
        env: Record<string, string>,
        targetFramework: string | undefined
    ): vscode.DebugConfiguration {
        const projectDir = path.dirname(projectPath);
        const assemblyName = this.getAssemblyNameFromProject(projectPath) || this.getProjectNameFromPath(projectPath);
        const framework = targetFramework || 'netcoreapp3.1';
        const program = path.join(projectDir, 'bin', 'Debug', framework, `${assemblyName}.dll`);

        return {
            name: debugName,
            type: 'coreclr',
            request: 'launch',
            projectPath,
            program,
            cwd: projectDir,
            env,
            stopAtEntry: false
        };
    }

    /**
     * 从 csproj 读取 AssemblyName（若未显式配置则返回 undefined）
     */
    private getAssemblyNameFromProject(projectPath: string): string | undefined {
        try {
            if (!fs.existsSync(projectPath)) {
                return undefined;
            }

            const content = fs.readFileSync(projectPath, 'utf8');
            const assemblyNameMatch = content.match(/<AssemblyName>\s*([^<\s]+)\s*<\/AssemblyName>/i);
            return assemblyNameMatch?.[1]?.trim();
        } catch {
            return undefined;
        }
    }

    /**
     * 解析 TFM 版本（支持后缀，如 net8.0-windows）
     */
    private parseNetVersion(
        targetFramework: string,
        prefix: 'net' | 'netcoreapp'
    ): { major: number; minor: number } | undefined {
        const tfm = targetFramework.trim().toLowerCase();
        const baseTfm = tfm.split('-')[0];
        const regex = new RegExp(`^${prefix}(\\d+)\\.(\\d+)$`, 'i');
        const match = baseTfm.match(regex);

        if (!match) {
            return undefined;
        }

        return {
            major: Number(match[1]),
            minor: Number(match[2])
        };
    }

    /**
     * 发送 HTTP 请求
     */
    private async sendHttpRequest(requestData: {
        method: string;
        url: string;
        headers: Record<string, string>;
        token?: string;
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

    private getRequestTimeoutMs(): number | undefined {
        const timeoutSeconds = vscode.workspace
            .getConfiguration('csharpApiConsole')
            .get<number>('requestTimeoutSeconds', 0);

        if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
            return undefined;
        }

        return Math.floor(timeoutSeconds * 1000);
    }

    private getRenderSettings(): { largeResponseThresholdBytes: number; maxResponseLineNumbers: number; jsonIndentSpaces: 2 | 4 } {
        const config = vscode.workspace.getConfiguration('csharpApiConsole');
        const thresholdKb = config.get<number>('largeResponseThresholdKb', 1024);
        const maxLineNumbers = config.get<number>('maxResponseLineNumbers', 2000);
        const jsonIndentSpaces = config.get<number>('jsonIndentSpaces', 2);

        const safeThresholdKb = Number.isFinite(thresholdKb) && thresholdKb > 0 ? thresholdKb : 1024;
        const safeMaxLineNumbers = Number.isFinite(maxLineNumbers) && maxLineNumbers > 0
            ? Math.floor(maxLineNumbers)
            : 2000;

        return {
            largeResponseThresholdBytes: Math.floor(safeThresholdKb * 1024),
            maxResponseLineNumbers: safeMaxLineNumbers,
            jsonIndentSpaces: jsonIndentSpaces === 4 ? 4 : 2
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

    private shouldSaveBearerTokenInHistory(): boolean {
        return vscode.workspace
            .getConfiguration('csharpApiConsole')
            .get<boolean>('requestHistorySaveBearerToken', false);
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
            token?: string;
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
        const shouldSaveToken = this.shouldSaveBearerTokenInHistory();
        const token = shouldSaveToken
            ? (requestData.token?.trim() || '')
            : '';

        const item: RequestHistoryItem = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            query,
            body,
            token,
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
        const shouldExposeToken = this.shouldSaveBearerTokenInHistory();
        const historyForWebView = shouldExposeToken
            ? history
            : history.map(item => ({
                ...item,
                token: ''
            }));

        this.panel.webview.postMessage({
            type: 'requestHistoryLoaded',
            data: historyForWebView
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
        if (ApiConsolePanel.currentPanel === this) {
            ApiConsolePanel.currentPanel = undefined;
        }
        const mappedPanel = ApiConsolePanel.panelByEndpointKey.get(this.endpointKey);
        if (mappedPanel === this) {
            ApiConsolePanel.panelByEndpointKey.delete(this.endpointKey);
        }
        ApiConsolePanel.openPanels.delete(this);
        ApiConsolePanel.panelById.delete(String(this.panelId));
        ApiConsolePanel.onDidPanelsChangedEmitter.fire();

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