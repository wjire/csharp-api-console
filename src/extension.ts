import * as vscode from 'vscode';
import { ApiEndpointAnalyzer } from './apiEndpointAnalyzer';
import { CodeLensProvider } from './codeLensProvider';
import { ApiConsolePanel } from './apiConsolePanel';
import { ProjectConfigCache } from './projectConfigCache';
import { BaseUrlConfigManager } from './services/baseUrlConfigManager';
import { TestPanelHubViewProvider } from './testPanelHubViewProvider';

// 全局配置管理器
let baseUrlConfigManager: BaseUrlConfigManager | undefined;

/**
 * 插件激活入口
 */
export function activate(context: vscode.ExtensionContext) {
    // 1. 创建项目配置缓存
    const projectConfigCache = new ProjectConfigCache();

    const getWorkspaceRoot = (): string | undefined => {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    };

    const ensureBaseUrlConfigManager = (): BaseUrlConfigManager | undefined => {
        if (baseUrlConfigManager) {
            return baseUrlConfigManager;
        }

        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            return undefined;
        }

        try {
            baseUrlConfigManager = new BaseUrlConfigManager(workspaceRoot);
            return baseUrlConfigManager;
        } catch (error) {
            console.error('[extension] Failed to initialize BaseUrlConfigManager:', error);
            return undefined;
        }
    };

    context.subscriptions.push({
        dispose: () => baseUrlConfigManager?.dispose()
    });

    // 2. 监听 launchSettings.json 变化，自动清除缓存
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
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
    }

    // 3. 注册 API 测试命令
    context.subscriptions.push(
        vscode.commands.registerCommand('csharpApiConsole.testEndpoint', async (apiInfo) => {
            const manager = ensureBaseUrlConfigManager();
            if (!manager) {
                vscode.window.showErrorMessage('请先打开一个工作区');
                return;
            }

            await ApiConsolePanel.createOrShow(context.extensionUri, apiInfo, projectConfigCache, manager, context);
        })
    );

    context.subscriptions.push(
        vscode.window.tabGroups.onDidChangeTabs(() => {
            ApiConsolePanel.syncTabPinnedStates();
        })
    );

    const testPanelHubProvider = new TestPanelHubViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('csharpApiConsoleTestPanelsView', testPanelHubProvider)
    );
    context.subscriptions.push(testPanelHubProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand('csharpApiConsole.openTestPanelsView', async () => {
            await vscode.commands.executeCommand('workbench.view.extension.csharpApiConsoleActivity');
            await vscode.commands.executeCommand('csharpApiConsoleTestPanelsView.focus');
        })
    );

    // 4. 全局监听调试会话生命周期（面板关闭后仍可维护状态）
    context.subscriptions.push(
        vscode.debug.onDidStartDebugSession(session => {
            ApiConsolePanel.onDebugSessionStarted(session);
        })
    );

    context.subscriptions.push(
        vscode.debug.onDidTerminateDebugSession(session => {
            ApiConsolePanel.onDebugSessionTerminated(session);
        })
    );

    // 5. 初始化 API 测试相关组件
    const apiAnalyzer = new ApiEndpointAnalyzer();
    const codeLensProvider = new CodeLensProvider(apiAnalyzer);

    // 6. 注册 CodeLens Provider
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
