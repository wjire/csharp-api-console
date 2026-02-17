import * as vscode from 'vscode';
import { ApiEndpoint } from './models/apiEndpoint';
import { ApiRouteBuilder } from './apiRouteBuilder';

/**
 * API 端点分析器
 * 检测 C# Controller 中的 API 端点，解析参数信息
 */
export class ApiEndpointAnalyzer {
    private readonly routeBuilder = new ApiRouteBuilder();
    private static readonly primitiveTypeNames = new Set([
        'string',
        'bool',
        'boolean',
        'byte',
        'sbyte',
        'short',
        'ushort',
        'int',
        'uint',
        'long',
        'ulong',
        'float',
        'double',
        'decimal',
        'char',
        'guid',
        'datetime',
        'datetimeoffset',
        'timespan',
        'uri'
    ]);

    /**
     * 从文档位置检测 API 端点
     * @param document 当前文档
     * @param position 光标位置（通常是方法定义行）
     * @returns API 端点信息或 null
     */
    async detectApiEndpoint(document: vscode.TextDocument, position: vscode.Position): Promise<ApiEndpoint | null> {
        const text = document.getText();
        const lines = text.split('\n');

        // 找到方法定义所在行
        let methodLine = position.line;
        const methodText = lines[methodLine];

        // 确认是方法定义
        if (!ApiEndpointAnalyzer.isMethodDefinition(methodText)) {
            return null;
        }

        // 解析方法名
        const methodName = this.extractMethodName(methodText);
        if (!methodName) {
            return null;
        }

        // 查找控制器名称和控制器路由
        const { controllerName, controllerRoute } = this.findControllerInfo(lines, methodLine);

        if (!controllerName) {
            return null;
        }

        // 向上查找 HTTP 方法特性和 Route 特性
        const { httpMethod, routeTemplate } = this.findHttpAttributeAndRoute(lines, methodLine, controllerRoute);

        if (!httpMethod) {
            return null; // 不是 API 方法
        }

        // 构建完整路由
        const fullRoute = this.routeBuilder.buildFullRoute(
            controllerRoute,
            routeTemplate,
            controllerName,
            methodName,
            lines,
            methodLine,
            document.uri.fsPath
        );

        // 性能优化：延迟加载项目配置
        // 不在扫描时查找项目文件和读取配置，而是在用户点击时才加载
        // 这样可以大幅减少文件 I/O 操作，提升扫描速度

        const autoQueryParamNames = this.extractAutoQueryParamNames(lines, methodLine);

        return {
            httpMethod: httpMethod as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY',
            routeTemplate: fullRoute,
            controller: controllerName,
            action: methodName,
            filePath: document.uri.fsPath,
            lineNumber: methodLine + 1,
            projectPath: await ApiEndpointAnalyzer.findProjectFile(document.uri.fsPath),
            autoQueryParamNames: autoQueryParamNames.length > 0 ? autoQueryParamNames : undefined
        };
    }

    public static isMethodDefinition(line: string): boolean {
        const methodRegex = /(?:public|private|protected|internal)\s+(?:async\s+)?(?:Task<)?[\w<>?]+(?:>)?\s+\w+\s*\(/;
        return methodRegex.test(line);
    }

    /**
     * 提取方法名
     */
    private extractMethodName(line: string): string | null {
        const methodRegex = /(?:public|private|protected|internal)\s+(?:async\s+)?(?:Task<)?[\w<>?]+(?:>)?\s+(\w+)\s*\(/;
        const match = methodRegex.exec(line);
        return match ? match[1] : null;
    }

    /**
     * 查找 HTTP 方法特性和路由
     */
    private findHttpAttributeAndRoute(lines: string[], methodLine: number, controllerRoute: string | null): {
        httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY' | null;
        routeTemplate: string
    } {
        let httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY' | null = null;
        let routeTemplate = '';

        // 检查控制器路由是否包含 [action] 占位符
        const hasActionPlaceholder = controllerRoute?.includes('[action]') || controllerRoute?.includes('[Action]');

        // 向上查找最多 10 行
        const startLine = Math.max(0, methodLine - 10);

        for (let i = methodLine - 1; i >= startLine; i--) {
            const line = lines[i].trim();

            // 跳过空行
            if (!line) {
                continue;
            }

            // 跳过注释
            if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
                continue;
            }

            // 遇到另一个方法定义停止（避免跨越到上一个方法）
            if (ApiEndpointAnalyzer.isMethodDefinition(line)) {
                break;
            }

            // 遇到 class 定义停止
            if (/\bclass\b/.test(line)) {
                break;
            }

            // 遇到方法的右花括号停止（上一个方法的结束）
            if (line === '}' || line.startsWith('}')) {
                break;
            }

            // 检查 HTTP 方法特性（支持同行多个特性，如 [HttpGet, Route("query")] 或 [Route("list"), HttpGet]）
            const httpMatch = line.match(/(HttpGet|HttpPost|HttpPut|HttpDelete)(?:\s*\(\s*"([^"]*)"\s*\))?/);
            if (httpMatch) {
                httpMethod = httpMatch[1].replace('Http', '').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE';
                if (httpMatch[2]) {
                    routeTemplate = httpMatch[2];
                }
                // 不要立即停止，继续向上查找可能存在的 Route 特性
            }

            // 检查 Route 特性（支持同行多个特性）
            const routeMatch = line.match(/Route\s*\(\s*"([^"]+)"\s*\)/);
            if (routeMatch && !routeTemplate) {
                routeTemplate = routeMatch[1];
            }
        }

        // 如果控制器路由包含 [action] 且没有找到 HTTP 谓词特性，则标记为 ANY
        if (!httpMethod && hasActionPlaceholder) {
            httpMethod = 'ANY';
        }

        return { httpMethod, routeTemplate };
    }

    /**
     * 查找控制器信息
     */
    private findControllerInfo(lines: string[], methodLine: number): {
        controllerName: string | null;
        controllerRoute: string | null
    } {
        let controllerName: string | null = null;
        let controllerRoute: string | null = null;

        // 向上查找控制器定义
        for (let i = methodLine; i >= 0; i--) {
            const line = lines[i];

            // 查找控制器类定义
            const controllerMatch = line.match(/(?:public|private|protected|internal)?\s*(?:static|abstract|sealed)?\s*class\s+(\w+Controller)/);
            if (controllerMatch) {
                controllerName = controllerMatch[1];

                // 在控制器定义前查找 Route 特性
                for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
                    const attrLine = lines[j].trim();
                    const routeMatch = attrLine.match(/\[Route\s*\(\s*"([^"]+)"\s*\)\]/);
                    if (routeMatch) {
                        controllerRoute = routeMatch[1];
                        break;
                    }
                }
                break;
            }
        }

        return { controllerName, controllerRoute };
    }

    private extractAutoQueryParamNames(lines: string[], methodLine: number): string[] {
        const signature = this.extractMethodSignature(lines, methodLine);
        if (!signature) {
            return [];
        }

        const parameterSection = this.extractParameterSection(signature);
        if (!parameterSection) {
            return [];
        }
        const result: string[] = [];

        for (const rawParameter of this.splitParameters(parameterSection)) {
            const parsed = this.parseParameter(rawParameter);
            if (!parsed) {
                continue;
            }

            if (!this.isPrimitiveType(parsed.typeName)) {
                continue;
            }

            if (parsed.source === 'body' || parsed.source === 'route' || parsed.source === 'header' || parsed.source === 'services' || parsed.source === 'form') {
                continue;
            }

            result.push(parsed.name);
        }

        return result;
    }

    private extractMethodSignature(lines: string[], methodLine: number): string {
        let signature = lines[methodLine] ?? '';

        if (signature.includes(')')) {
            return signature;
        }

        for (let index = methodLine + 1; index < lines.length && index <= methodLine + 20; index++) {
            signature += ` ${lines[index].trim()}`;
            if (lines[index].includes(')')) {
                break;
            }
        }

        return signature;
    }

    private extractParameterSection(signature: string): string | null {
        const firstParen = signature.indexOf('(');
        if (firstParen < 0) {
            return null;
        }

        let depth = 0;
        for (let i = firstParen; i < signature.length; i++) {
            const char = signature[i];
            if (char === '(') {
                depth += 1;
                continue;
            }

            if (char === ')') {
                depth -= 1;
                if (depth === 0) {
                    return signature.substring(firstParen + 1, i);
                }
            }
        }

        return null;
    }

    private splitParameters(parameterSection: string): string[] {
        const segments: string[] = [];
        let current = '';
        let angleDepth = 0;
        let parenDepth = 0;
        let bracketDepth = 0;

        for (const char of parameterSection) {
            if (char === '<') {
                angleDepth += 1;
            } else if (char === '>') {
                angleDepth = Math.max(0, angleDepth - 1);
            } else if (char === '(') {
                parenDepth += 1;
            } else if (char === ')') {
                parenDepth = Math.max(0, parenDepth - 1);
            } else if (char === '[') {
                bracketDepth += 1;
            } else if (char === ']') {
                bracketDepth = Math.max(0, bracketDepth - 1);
            }

            if (char === ',' && angleDepth === 0 && parenDepth === 0 && bracketDepth === 0) {
                if (current.trim()) {
                    segments.push(current.trim());
                }
                current = '';
                continue;
            }

            current += char;
        }

        if (current.trim()) {
            segments.push(current.trim());
        }

        return segments;
    }

    private parseParameter(parameter: string): { name: string; typeName: string; source: 'query' | 'body' | 'route' | 'header' | 'services' | 'form' | 'unknown' } | null {
        if (!parameter) {
            return null;
        }

        const withoutDefaultValue = parameter.split('=')[0].trim();
        if (!withoutDefaultValue) {
            return null;
        }

        const source = this.detectParameterSource(withoutDefaultValue);

        let normalized = withoutDefaultValue
            .replace(/^\s*(\[[^\]]+\]\s*)+/g, '')
            .replace(/^\s*(?:this|ref|out|in|params)\s+/g, '')
            .trim();

        if (!normalized) {
            return null;
        }

        const parts = normalized.split(/\s+/).filter(Boolean);
        if (parts.length < 2) {
            return null;
        }

        const name = parts[parts.length - 1].replace(/^@/, '').trim();
        const typeName = parts.slice(0, -1).join(' ').trim();

        if (!name || !typeName) {
            return null;
        }

        return { name, typeName, source };
    }

    private detectParameterSource(parameter: string): 'query' | 'body' | 'route' | 'header' | 'services' | 'form' | 'unknown' {
        const lower = parameter.toLowerCase();
        if (lower.includes('[frombody')) {
            return 'body';
        }
        if (lower.includes('[fromroute')) {
            return 'route';
        }
        if (lower.includes('[fromquery')) {
            return 'query';
        }
        if (lower.includes('[fromheader')) {
            return 'header';
        }
        if (lower.includes('[fromservices')) {
            return 'services';
        }
        if (lower.includes('[fromform')) {
            return 'form';
        }
        return 'unknown';
    }

    private isPrimitiveType(typeName: string): boolean {
        let normalized = typeName
            .replace(/\?/g, '')
            .replace(/^global::/i, '')
            .replace(/^System\./i, '')
            .replace(/\s/g, '')
            .toLowerCase();

        if (normalized.endsWith("[]")) {
            return false;
        }

        if (normalized.startsWith('nullable<') && normalized.endsWith('>')) {
            normalized = normalized.substring('nullable<'.length, normalized.length - 1);
        }

        return ApiEndpointAnalyzer.primitiveTypeNames.has(normalized);
    }

    /**
     * 查找项目文件（公共静态方法，供外部调用）
     */
    public static async findProjectFile(filePath: string): Promise<string | undefined> {
        const path = require('path');
        let currentDir = path.dirname(filePath);

        // 最多向上查找 10 层
        for (let i = 0; i < 10; i++) {
            try {
                const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentDir));
                const csprojFile = files.find(([name, type]) =>
                    type === vscode.FileType.File && name.endsWith('.csproj')
                );

                if (csprojFile) {
                    return path.join(currentDir, csprojFile[0]);
                }

                const parentDir = path.dirname(currentDir);
                if (parentDir === currentDir) {
                    break;
                }
                currentDir = parentDir;
            } catch (error) {
                break;
            }
        }

        return undefined;
    }
}
