import * as vscode from 'vscode';
import { ApiEndpointAnalyzer } from './apiEndpointAnalyzer';
import { CodeLensProvider } from './codeLensProvider';
import { ApiConsolePanel } from './apiConsolePanel';
import { ProjectConfigCache } from './projectConfigCache';
import { BaseUrlConfigManager } from './services/baseUrlConfigManager';

// 全局配置管理器
let baseUrlConfigManager: BaseUrlConfigManager;

/**
 * 插件激活入口
 */
export function activate(context: vscode.ExtensionContext) {
    // 获取工作区根目录
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        vscode.window.showErrorMessage('请先打开一个工作区');
        return;
    }

    // 0. 初始化 Base URL 配置管理器（插件启动时加载配置）
    baseUrlConfigManager = new BaseUrlConfigManager(workspaceRoot);
    context.subscriptions.push({
        dispose: () => baseUrlConfigManager.dispose()
    });

    // 1. 创建项目配置缓存
    const projectConfigCache = new ProjectConfigCache();

    // 2. 监听 launchSettings.json 变化，自动清除缓存
    const watcher = vscode.workspace.createFileSystemWatcher(
        '**/Properties/launchSettings.json'
    );

    watcher.onDidChange(uri => {
        projectConfigCache.clearBaseUrlCacheByLaunchSettings(uri.fsPath);
    });

    watcher.onDidCreate(uri => {
        projectConfigCache.clearBaseUrlCacheByLaunchSettings(uri.fsPath);
    });

    watcher.onDidDelete(uri => {
        projectConfigCache.clearBaseUrlCacheByLaunchSettings(uri.fsPath);
    });

    context.subscriptions.push(watcher);

    // 3. 注册 API 测试命令
    context.subscriptions.push(
        vscode.commands.registerCommand('csharpApiConsole.testEndpoint', (apiInfo) => {
            ApiConsolePanel.createOrShow(context.extensionUri, apiInfo, projectConfigCache, baseUrlConfigManager, context);
        })
    );

    // 4. 初始化 API 测试相关组件
    const apiAnalyzer = new ApiEndpointAnalyzer();
    const codeLensProvider = new CodeLensProvider(apiAnalyzer);

    // 5. 注册 CodeLens Provider
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider('csharp', codeLensProvider)
    );
}

/**
 * 插件停用
 */
export function deactivate() {
    // 清理资源
}
