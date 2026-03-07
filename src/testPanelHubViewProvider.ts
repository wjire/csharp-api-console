import * as fs from 'fs';
import * as vscode from 'vscode';
import { ApiConsolePanel, OpenApiConsolePanelInfo } from './apiConsolePanel';

type DebugStatus = 'idle' | 'running';

interface FavoritePanelItem {
    endpointKey: string;
    displayName: string;
    method: string;
    route: string;
    action: string;
    projectPath: string;
    updatedAt: number;
}

interface CurrentPanelVm {
    id: string;
    endpointKey: string;
    displayName: string;
    method: string;
    route: string;
    action: string;
    projectPath: string;
    debugStatus: DebugStatus;
    isPinned: boolean;
    isVisible: boolean;
    isActive: boolean;
    isFavorite: boolean;
}

interface FavoritePanelVm {
    endpointKey: string;
    displayName: string;
    method: string;
    route: string;
    action: string;
    projectPath: string;
    panelId: string | null;
    isOpen: boolean;
    debugStatus: DebugStatus;
}

interface ViewState {
    currentPanels: CurrentPanelVm[];
    favorites: FavoritePanelVm[];
}

const FAVORITES_KEY = 'csharpApiConsole.testPanelFavorites';

export class TestPanelHubViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    private view: vscode.WebviewView | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly context: vscode.ExtensionContext
    ) {
        this.disposables.push(
            ApiConsolePanel.onDidPanelsChanged(() => this.refresh())
        );
        this.disposables.push(
            vscode.window.tabGroups.onDidChangeTabs(() => this.refresh())
        );
    }

    public resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        this.view.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'webview')
            ]
        };

        this.view.webview.html = this.getHtml(this.view.webview);

        this.view.webview.onDidReceiveMessage(
            async (message: any) => {
                const messageType = String(message?.type || '');

                if (messageType === 'ready' || messageType === 'refresh') {
                    this.refresh();
                    return;
                }

                if (messageType === 'revealPanel') {
                    const panelId = String(message?.data?.panelId || '');
                    const revealed = ApiConsolePanel.revealPanelById(panelId);
                    if (!revealed) {
                        void vscode.window.showWarningMessage('测试面板不存在，可能已被关闭。');
                    }
                    this.refresh();
                    return;
                }

                if (messageType === 'toggleFavorite') {
                    const endpointKey = String(message?.data?.endpointKey || '');
                    if (endpointKey) {
                        await this.toggleFavorite(endpointKey);
                        this.refresh();
                    }
                    return;
                }

                if (messageType === 'renameFavorite') {
                    const endpointKey = String(message?.data?.endpointKey || '');
                    const displayName = String(message?.data?.displayName || '').trim();
                    if (endpointKey && displayName) {
                        await this.renameFavorite(endpointKey, displayName);
                        this.refresh();
                    }
                }
            },
            undefined,
            this.disposables
        );

        this.disposables.push(
            this.view.onDidDispose(() => {
                this.view = undefined;
            })
        );

        this.refresh();
    }

    public refresh(): void {
        if (!this.view) {
            return;
        }

        const state = this.buildState();
        void this.view.webview.postMessage({
            type: 'state',
            data: state
        });
    }

    public dispose(): void {
        while (this.disposables.length > 0) {
            const disposable = this.disposables.pop();
            disposable?.dispose();
        }
    }

    private getHtml(webview: vscode.Webview): string {
        const htmlPath = vscode.Uri.joinPath(this.extensionUri, 'webview', 'test-panel-hub.html');
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'webview', 'test-panel-hub.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'webview', 'test-panel-hub.js')
        );

        const htmlTemplate = fs.readFileSync(htmlPath.fsPath, 'utf8');
        return htmlTemplate
            .replace('{{CSS_URI}}', cssUri.toString())
            .replace('{{SCRIPT_URI}}', scriptUri.toString());
    }

    private buildState(): ViewState {
        const openPanels = ApiConsolePanel.getOpenPanelInfos();
        const favorites = this.getFavorites();

        const openByEndpoint = new Map<string, OpenApiConsolePanelInfo>();
        for (const panel of openPanels) {
            openByEndpoint.set(panel.endpointKey, panel);
        }

        const favoriteByEndpoint = new Map<string, FavoritePanelItem>();
        for (const favorite of favorites) {
            favoriteByEndpoint.set(favorite.endpointKey, favorite);
        }

        const currentPanels: CurrentPanelVm[] = openPanels.map(panel => {
            const favorite = favoriteByEndpoint.get(panel.endpointKey);
            const fallbackName = this.getDefaultDisplayName(panel);

            return {
                id: panel.id,
                endpointKey: panel.endpointKey,
                displayName: favorite?.displayName || fallbackName,
                method: panel.method,
                route: panel.route,
                action: panel.action,
                projectPath: panel.projectPath,
                debugStatus: panel.debugStatus,
                isPinned: panel.isPinned,
                isVisible: panel.isVisible,
                isActive: panel.isActive,
                isFavorite: favoriteByEndpoint.has(panel.endpointKey)
            };
        });

        const favoritePanels: FavoritePanelVm[] = favorites.map(favorite => {
            const open = openByEndpoint.get(favorite.endpointKey);
            const method = open?.method || favorite.method;
            const route = open?.route || favorite.route;
            const action = open?.action || favorite.action;
            const projectPath = open?.projectPath || favorite.projectPath;

            return {
                endpointKey: favorite.endpointKey,
                displayName: favorite.displayName,
                method,
                route,
                action,
                projectPath,
                panelId: open?.id || null,
                isOpen: Boolean(open),
                debugStatus: open?.debugStatus || 'idle'
            };
        });

        return {
            currentPanels,
            favorites: favoritePanels
        };
    }

    private async toggleFavorite(endpointKey: string): Promise<void> {
        const favorites = this.getFavorites();
        const index = favorites.findIndex(item => item.endpointKey === endpointKey);

        if (index >= 0) {
            favorites.splice(index, 1);
            await this.saveFavorites(favorites);
            return;
        }

        const panel = ApiConsolePanel.getOpenPanelInfos().find(item => item.endpointKey === endpointKey);
        if (!panel) {
            return;
        }

        favorites.unshift({
            endpointKey,
            displayName: this.getDefaultDisplayName(panel),
            method: panel.method,
            route: panel.route,
            action: panel.action,
            projectPath: panel.projectPath,
            updatedAt: Date.now()
        });

        await this.saveFavorites(favorites);
    }

    private async renameFavorite(endpointKey: string, displayName: string): Promise<void> {
        const favorites = this.getFavorites();
        const existing = favorites.find(item => item.endpointKey === endpointKey);

        if (existing) {
            existing.displayName = displayName;
            existing.updatedAt = Date.now();
            await this.saveFavorites(favorites);
            return;
        }

        const panel = ApiConsolePanel.getOpenPanelInfos().find(item => item.endpointKey === endpointKey);
        if (!panel) {
            return;
        }

        favorites.unshift({
            endpointKey,
            displayName,
            method: panel.method,
            route: panel.route,
            action: panel.action,
            projectPath: panel.projectPath,
            updatedAt: Date.now()
        });

        await this.saveFavorites(favorites);
    }

    private getFavorites(): FavoritePanelItem[] {
        const value = this.context.workspaceState.get<FavoritePanelItem[]>(FAVORITES_KEY, []);
        return Array.isArray(value) ? [...value] : [];
    }

    private async saveFavorites(favorites: FavoritePanelItem[]): Promise<void> {
        const deduped = new Map<string, FavoritePanelItem>();
        for (const item of favorites) {
            deduped.set(item.endpointKey, item);
        }

        const ordered = Array.from(deduped.values())
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 200);

        await this.context.workspaceState.update(FAVORITES_KEY, ordered);
    }

    private getDefaultDisplayName(panel: OpenApiConsolePanelInfo): string {
        const action = (panel.action || '').trim();
        if (action.length > 0) {
            return action;
        }

        const route = (panel.route || '').trim();
        if (route.length > 0) {
            return route;
        }

        return panel.title;
    }
}
