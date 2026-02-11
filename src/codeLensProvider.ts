import * as vscode from 'vscode';
import { ApiEndpointAnalyzer } from './apiEndpointAnalyzer';
import { CodeLensCache } from './services/codeLensCache';

/**
 * CodeLens 提供者
 * 在 C# Controller 的 Action 方法上显示 "⚡ Test Endpoint" 按钮
 */
export class CodeLensProvider implements vscode.CodeLensProvider {
    private analyzer: ApiEndpointAnalyzer;
    private cache: CodeLensCache;

    // 🚀 正则表达式缓存，避免每次调用都重新编译
    private readonly methodNameRegex = /\s+(\w+)\s*\(/;

    constructor(analyzer: ApiEndpointAnalyzer) {
        this.analyzer = analyzer;
        this.cache = new CodeLensCache();
    }

    /**
     * 提供 CodeLens
     */
    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        // 只处理 C# 文件
        if (document.languageId !== 'csharp') {
            return [];
        }

        // 只处理 Controller 文件
        const fileName = document.fileName.split(/[\\/]/).pop() || '';
        if (!fileName.endsWith('Controller.cs')) {
            return [];
        }

        // 🚀 检查缓存：如果文档版本号未变化，直接返回缓存结果
        const cacheKey = document.uri.toString();
        const cached = this.cache.get(cacheKey);

        if (cached && cached.version === document.version) {
            // 缓存命中，直接返回（避免重复扫描）
            return cached.codeLenses;
        }

        // 缓存未命中或文档已修改，使用防抖动机制
        const config = vscode.workspace.getConfiguration('csharpApiConsole');
        const debounceDelay = config.get<number>('codeLensDebounceDelay', 300);

        // 使用 CodeLensCache 的防抖功能
        return this.cache.debounce(
            cacheKey,
            async () => {
                const codeLenses = await this.scanDocument(document);
                this.cache.set(cacheKey, {
                    version: document.version,
                    codeLenses
                });
                return codeLenses;
            },
            debounceDelay,
            cached?.codeLenses  // 如果有旧缓存，先返回旧的（避免闪烁）
        );
    }



    /**
     * 扫描文档，查找所有 API 端点并生成 CodeLens
     */
    private async scanDocument(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];

        const text = document.getText();
        const lines = text.split('\n');

        // 遍历所有行，查找方法定义
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // 检查是否是方法定义行
            if (!ApiEndpointAnalyzer.isMethodDefinition(line)) {
                continue;
            }

            // 🚀 直接调用 detectApiEndpoint，所有解析逻辑统一在 Analyzer 中
            // 包括：HTTP 特性检查、[action] 占位符处理、边界检查等
            const position = new vscode.Position(i, 0);
            const apiEndpoint = await this.analyzer.detectApiEndpoint(document, position);

            if (!apiEndpoint) {
                continue;
            }

            // 创建 CodeLens 并立即设置命令
            // 🚀 定位到方法名位置（而不是行首），确保显示在"引用"右侧
            const methodNameColumn = this.findMethodNameColumn(line);
            const range = new vscode.Range(i, methodNameColumn, i, methodNameColumn);

            // 🚀 显示完整路由信息（不含 baseUrl）
            const title = `⚡ ${apiEndpoint.httpMethod} ${apiEndpoint.routeTemplate}`;

            const codeLens = new vscode.CodeLens(range, {
                title: title,
                command: 'csharpApiConsole.testEndpoint',
                arguments: [apiEndpoint]
            });

            codeLenses.push(codeLens);
        }

        return codeLenses;
    }

    /**
     * 查找方法名在行中的列位置
     * 性能优化：使用缓存的正则表达式，避免重复编译
     */
    private findMethodNameColumn(line: string): number {
        // 匹配方法名：public async Task<IActionResult> GetUsers(...)
        // 查找最后一个标识符在左括号前的位置
        const match = line.match(this.methodNameRegex);
        if (match && match.index !== undefined) {
            // 返回方法名开始的位置
            return match.index + match[0].indexOf(match[1]);
        }
        // 如果无法匹配，回退到行首
        return 0;
    }

    /**
     * 解析 CodeLens（已在 provideCodeLenses 中完成，此方法可选）
     */
    async resolveCodeLens(
        codeLens: vscode.CodeLens,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens> {
        // 命令已在 provideCodeLenses 中设置，直接返回
        return codeLens;
    }
}
