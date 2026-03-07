import * as fs from 'fs';
import * as vscode from 'vscode';
import { ApiConsolePanel, OpenApiConsolePanelInfo } from './apiConsolePanel';
import { lang } from './languageManager';

type DebugStatus = 'idle' | 'running';

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

interface ViewState {
    currentPanels: CurrentPanelVm[];
    i18n: {
        currentTabLabel: string;
        noPanelsMessage: string;
        panelMissingWarning: string;
    };
}

export class TestPanelHubViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    private view: vscode.WebviewView | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(private readonly extensionUri: vscode.Uri) {
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

                if (messageType === 'ready') {
                    this.refresh();
                    return;
                }

                if (messageType === 'revealPanel') {
                    const panelId = String(message?.data?.panelId || '');
                    const revealed = ApiConsolePanel.revealPanelById(panelId);
                    if (!revealed) {
                        void vscode.window.showWarningMessage(this.getI18nTexts().panelMissingWarning);
                    }
                    this.refresh();
                    return;
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

        const currentPanels: CurrentPanelVm[] = openPanels.map(panel => {
            const baseUrl = this.getBaseUrlDisplayName(panel);

            return {
                id: panel.id,
                endpointKey: panel.endpointKey,
                displayName: baseUrl,
                method: panel.method,
                route: panel.route,
                action: panel.action,
                projectPath: panel.projectPath,
                debugStatus: panel.debugStatus,
                isPinned: panel.isPinned,
                isVisible: panel.isVisible,
                isActive: panel.isActive,
                isFavorite: false
            };
        });

        return {
            currentPanels,
            i18n: this.getI18nTexts()
        };
    }

    private getI18nTexts(): {
        currentTabLabel: string;
        noPanelsMessage: string;
        panelMissingWarning: string;
    } {
        return {
            currentTabLabel: lang.t('webview.hub.current'),
            noPanelsMessage: lang.t('webview.hub.empty'),
            panelMissingWarning: lang.t('webview.hub.panelMissing')
        };
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

    private getBaseUrlDisplayName(panel: OpenApiConsolePanelInfo): string {
        const fullUrl = (panel.fullUrl || '').trim();
        if (fullUrl.length > 0) {
            try {
                const parsed = new URL(fullUrl);
                return parsed.origin;
            } catch {
                // Ignore parsing failure and continue with fallback extraction.
            }
        }

        const route = (panel.route || '').trim();
        if (fullUrl.length > route.length && route.length > 0 && fullUrl.endsWith(route)) {
            return fullUrl.slice(0, fullUrl.length - route.length).replace(/\/$/, '');
        }

        return this.getDefaultDisplayName(panel);
    }
}
