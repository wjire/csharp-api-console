import * as path from 'path';
import * as vscode from 'vscode';
import { ApiRouteBuilder } from './apiRouteBuilder';
import { ApiEndpoint } from './models/apiEndpoint';

type MethodParameterInfo = {
    name: string;
    typeName: string;
    source: 'query' | 'body' | 'route' | 'header' | 'services' | 'form' | 'unknown';
};

/**
 * API 端点分析器
 * 检测 C# Controller 中的 API 端点，解析参数信息
 */
export class ApiEndpointAnalyzer {
    private readonly routeBuilder = new ApiRouteBuilder();
    private static readonly typeLinesCache = new Map<string, string[] | null>();
    private static readonly infrastructureTypeNames = new Set([
        'cancellationtoken',
        'httpcontext',
        'httprequest',
        'httpresponse',
        'httprequestmessage',
        'httpcontent',
        'claimsprincipal',
        'principal',
        'stream',
        'iformcollection',
        'iformfilecollection'
    ]);
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

        const projectPath = await ApiEndpointAnalyzer.findProjectFile(document.uri.fsPath);
        const autoQueryParamNames = this.extractAutoQueryParamNames(lines, methodLine);
        const preferredBodyMode = this.detectPreferredBodyMode(lines, methodLine);

        return {
            httpMethod: httpMethod as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY',
            routeTemplate: fullRoute,
            controller: controllerName,
            action: methodName,
            filePath: document.uri.fsPath,
            lineNumber: methodLine + 1,
            projectPath,
            autoQueryParamNames: autoQueryParamNames.length > 0 ? autoQueryParamNames : undefined,
            preferredBodyMode
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

    private async buildAutoBodyJsonTemplate(
        lines: string[],
        methodLine: number,
        httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY',
        projectPath?: string,
        currentFilePath?: string
    ): Promise<string | undefined> {
        if (httpMethod === 'GET') {
            return undefined;
        }

        const signature = this.extractMethodSignature(lines, methodLine);
        if (!signature) {
            return undefined;
        }

        const parameterSection = this.extractParameterSection(signature);
        if (!parameterSection) {
            return undefined;
        }

        const parameters = this.splitParameters(parameterSection)
            .map(raw => this.parseParameter(raw))
            .filter((param): param is MethodParameterInfo => !!param);

        const bodyCandidates = parameters.filter(param => this.isBodyTemplateCandidate(param));
        if (bodyCandidates.length !== 1) {
            return undefined;
        }

        const bodyCandidateType = bodyCandidates[0].typeName;
        let bodyValue = this.buildJsonValueForType(bodyCandidateType, lines, new Set<string>(), 0);

        if (this.isEmptyObjectTemplate(bodyValue)) {
            const typeLinesFromProject = await this.findTypeLinesFromProject(bodyCandidateType, projectPath, currentFilePath);
            if (typeLinesFromProject && typeLinesFromProject.length > 0) {
                bodyValue = this.buildJsonValueForType(bodyCandidateType, [...lines, ...typeLinesFromProject], new Set<string>(), 0);
            }
        }

        if (bodyValue === undefined) {
            return undefined;
        }

        return JSON.stringify(bodyValue, null, 2);
    }

    private isEmptyObjectTemplate(value: unknown): boolean {
        if (!value || Array.isArray(value) || typeof value !== 'object') {
            return false;
        }

        return Object.keys(value as Record<string, unknown>).length === 0;
    }

    private async findTypeLinesFromProject(typeName: string, projectPath?: string, currentFilePath?: string): Promise<string[] | null> {
        const shortTypeName = this.getTypeShortName(typeName);
        if (!shortTypeName) {
            return null;
        }

        const searchRoot = this.resolveTypeSearchRoot(projectPath, currentFilePath);
        if (!searchRoot) {
            return null;
        }

        const cacheKey = `${searchRoot}::${shortTypeName.toLowerCase()}`;
        if (ApiEndpointAnalyzer.typeLinesCache.has(cacheKey)) {
            return ApiEndpointAnalyzer.typeLinesCache.get(cacheKey) || null;
        }

        let csFiles: vscode.Uri[] = [];
        try {
            csFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(searchRoot, '**/*.cs'));
        } catch {
            ApiEndpointAnalyzer.typeLinesCache.set(cacheKey, null);
            return null;
        }

        const escapedTypeName = this.escapeRegExp(shortTypeName);
        const typeDeclarationRegex = new RegExp(`\\b(?:class|record)\\s+${escapedTypeName}\\b`);

        for (const fileUri of csFiles) {
            const normalizedPath = fileUri.fsPath.replace(/\\/g, '/').toLowerCase();
            if (normalizedPath.includes('/bin/') || normalizedPath.includes('/obj/')) {
                continue;
            }

            if (currentFilePath && path.normalize(fileUri.fsPath) === path.normalize(currentFilePath)) {
                continue;
            }

            try {
                const contentBytes = await vscode.workspace.fs.readFile(fileUri);
                const content = Buffer.from(contentBytes).toString('utf8');
                if (!content.includes(shortTypeName)) {
                    continue;
                }

                const fileLines = content.split('\n');
                const declarationFound = fileLines.some(line => typeDeclarationRegex.test(line));
                if (!declarationFound) {
                    continue;
                }

                const properties = this.findTypeProperties(fileLines, shortTypeName);
                if (properties && properties.length > 0) {
                    ApiEndpointAnalyzer.typeLinesCache.set(cacheKey, fileLines);
                    return fileLines;
                }
            } catch {
                continue;
            }
        }

        ApiEndpointAnalyzer.typeLinesCache.set(cacheKey, null);
        return null;
    }

    private resolveTypeSearchRoot(projectPath?: string, currentFilePath?: string): string | null {
        if (projectPath) {
            return path.dirname(projectPath);
        }

        if (currentFilePath) {
            const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(currentFilePath));
            if (folder) {
                return folder.uri.fsPath;
            }
        }

        return null;
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

    private parseParameter(parameter: string): MethodParameterInfo | null {
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

    private isBodyTemplateCandidate(parameter: MethodParameterInfo): boolean {
        if (parameter.source === 'route' || parameter.source === 'query' || parameter.source === 'header' || parameter.source === 'services' || parameter.source === 'form') {
            return false;
        }

        if (!this.isComplexBodyType(parameter.typeName)) {
            return false;
        }

        return true;
    }

    private isComplexBodyType(typeName: string): boolean {
        if (this.isPrimitiveType(typeName)) {
            return false;
        }

        if (this.isIFormFileType(typeName)) {
            return false;
        }

        if (this.isInfrastructureType(typeName)) {
            return false;
        }

        return true;
    }

    private isInfrastructureType(typeName: string): boolean {
        const normalized = this.normalizeTypeName(typeName);
        const shortName = this.getTypeShortName(normalized);

        return ApiEndpointAnalyzer.infrastructureTypeNames.has(shortName.toLowerCase());
    }

    private buildJsonValueForType(
        typeName: string,
        lines: string[],
        visitedTypeNames: Set<string>,
        depth: number
    ): unknown {
        if (depth > 4) {
            return {};
        }

        const normalizedTypeName = this.normalizeTypeName(typeName);
        if (!normalizedTypeName) {
            return {};
        }

        if (this.isNullableType(typeName)) {
            return null;
        }

        const primitiveDefault = this.getPrimitiveDefaultValue(typeName);
        if (primitiveDefault !== undefined) {
            return primitiveDefault;
        }

        const arrayInnerType = this.tryExtractArrayInnerType(normalizedTypeName);
        if (arrayInnerType) {
            return [];
        }

        const collectionInnerType = this.tryExtractCollectionInnerType(normalizedTypeName);
        if (collectionInnerType) {
            return [];
        }

        const dictionaryValueType = this.tryExtractDictionaryValueType(normalizedTypeName);
        if (dictionaryValueType) {
            return {};
        }

        const shortTypeName = this.getTypeShortName(normalizedTypeName);
        const visitKey = shortTypeName.toLowerCase();
        if (visitedTypeNames.has(visitKey)) {
            return {};
        }

        const objectTemplate = this.tryBuildObjectTemplateFromType(shortTypeName, lines, visitedTypeNames, depth + 1);
        if (objectTemplate) {
            return objectTemplate;
        }

        return {};
    }

    private tryBuildObjectTemplateFromType(
        shortTypeName: string,
        lines: string[],
        visitedTypeNames: Set<string>,
        depth: number
    ): Record<string, unknown> | null {
        const typeProperties = this.findTypeProperties(lines, shortTypeName);
        if (!typeProperties || typeProperties.length === 0) {
            return null;
        }

        const visitKey = shortTypeName.toLowerCase();
        visitedTypeNames.add(visitKey);

        const result: Record<string, unknown> = {};
        for (const property of typeProperties) {
            result[property.name] = this.buildJsonValueForType(property.typeName, lines, visitedTypeNames, depth);
        }

        visitedTypeNames.delete(visitKey);
        return result;
    }

    private findTypeProperties(lines: string[], shortTypeName: string): Array<{ name: string; typeName: string }> | null {
        if (!shortTypeName) {
            return null;
        }

        const escapedTypeName = this.escapeRegExp(shortTypeName);
        const declarationRegex = new RegExp(`\\b(?:class|record)\\s+${escapedTypeName}\\b`);
        const positionalRecordRegex = new RegExp(`\\brecord\\s+${escapedTypeName}\\s*\\(([^)]*)\\)`);

        for (let index = 0; index < lines.length; index++) {
            const declarationLine = lines[index] || '';
            if (!declarationRegex.test(declarationLine)) {
                continue;
            }

            const positionalMatch = declarationLine.match(positionalRecordRegex);
            if (positionalMatch) {
                const properties = this.splitParameters(positionalMatch[1])
                    .map(raw => this.parseParameter(raw))
                    .filter((param): param is MethodParameterInfo => !!param)
                    .map(param => ({ name: param.name, typeName: param.typeName }));
                if (properties.length > 0) {
                    return properties;
                }
            }

            const properties = this.collectPropertiesInTypeBlock(lines, index);
            if (properties.length > 0) {
                return properties;
            }
        }

        return null;
    }

    private collectPropertiesInTypeBlock(lines: string[], declarationLineIndex: number): Array<{ name: string; typeName: string }> {
        const properties: Array<{ name: string; typeName: string }> = [];
        let braceDepth = 0;
        let started = false;

        for (let i = declarationLineIndex; i < lines.length; i++) {
            const line = lines[i] || '';

            for (const char of line) {
                if (char === '{') {
                    braceDepth += 1;
                    started = true;
                } else if (char === '}') {
                    braceDepth -= 1;
                }
            }

            if (started && braceDepth <= 0) {
                break;
            }

            if (!started || braceDepth !== 1) {
                continue;
            }

            const propertyMatch = line.match(/public\s+(?:required\s+)?(?:virtual\s+|override\s+|sealed\s+|new\s+)?([\w<>,\.\[\]\?\s]+)\s+(@?\w+)\s*\{\s*get\s*;[^}]*\}/);
            if (!propertyMatch) {
                continue;
            }

            const typeName = propertyMatch[1].trim();
            const name = propertyMatch[2].replace(/^@/, '').trim();
            if (!typeName || !name) {
                continue;
            }

            properties.push({ name, typeName });
        }

        return properties;
    }

    private getPrimitiveDefaultValue(typeName: string): string | number | boolean | null | undefined {
        const normalized = this.normalizeTypeName(typeName).toLowerCase();

        if (normalized === 'string' || normalized === 'guid' || normalized === 'datetime' || normalized === 'datetimeoffset' || normalized === 'timespan' || normalized === 'uri' || normalized === 'char') {
            return '';
        }

        if (normalized === 'bool' || normalized === 'boolean') {
            return false;
        }

        if (normalized === 'byte' || normalized === 'sbyte' || normalized === 'short' || normalized === 'ushort' || normalized === 'int' || normalized === 'uint' || normalized === 'long' || normalized === 'ulong' || normalized === 'float' || normalized === 'double' || normalized === 'decimal') {
            return 0;
        }

        return undefined;
    }

    private isNullableType(typeName: string): boolean {
        const normalized = typeName.replace(/\s+/g, '').trim();
        if (!normalized) {
            return false;
        }

        return normalized.endsWith('?') || /^Nullable<.+>$/.test(normalized);
    }

    private tryExtractArrayInnerType(typeName: string): string | null {
        if (typeName.endsWith('[]')) {
            return typeName.substring(0, typeName.length - 2);
        }
        return null;
    }

    private tryExtractCollectionInnerType(typeName: string): string | null {
        const genericMatch = typeName.match(/^([\w.]+)<(.+)>$/);
        if (!genericMatch) {
            return null;
        }

        const collectionType = this.getTypeShortName(genericMatch[1]).toLowerCase();
        if (collectionType === 'list' || collectionType === 'ilist' || collectionType === 'icollection' || collectionType === 'ienumerable' || collectionType === 'ireadonlylist' || collectionType === 'ireadonlycollection' || collectionType === 'hashset') {
            return genericMatch[2].trim();
        }

        return null;
    }

    private tryExtractDictionaryValueType(typeName: string): string | null {
        const genericMatch = typeName.match(/^([\w.]+)<(.+)>$/);
        if (!genericMatch) {
            return null;
        }

        const dictionaryType = this.getTypeShortName(genericMatch[1]).toLowerCase();
        if (dictionaryType !== 'dictionary' && dictionaryType !== 'idictionary' && dictionaryType !== 'ireadonlydictionary') {
            return null;
        }

        const genericArgs = this.splitGenericArguments(genericMatch[2]);
        return genericArgs.length === 2 ? genericArgs[1] : null;
    }

    private splitGenericArguments(value: string): string[] {
        const result: string[] = [];
        let current = '';
        let depth = 0;

        for (const char of value) {
            if (char === '<') {
                depth += 1;
            } else if (char === '>') {
                depth = Math.max(0, depth - 1);
            }

            if (char === ',' && depth === 0) {
                if (current.trim()) {
                    result.push(current.trim());
                }
                current = '';
                continue;
            }

            current += char;
        }

        if (current.trim()) {
            result.push(current.trim());
        }

        return result;
    }

    private normalizeTypeName(typeName: string): string {
        let normalized = (typeName || '')
            .replace(/\s+/g, '')
            .replace(/^global::/i, '')
            .replace(/^System\./i, '')
            .trim();

        if (normalized.endsWith('?')) {
            normalized = normalized.substring(0, normalized.length - 1);
        }

        const nullableMatch = normalized.match(/^Nullable<(.+)>$/);
        if (nullableMatch) {
            normalized = nullableMatch[1];
        }

        return normalized;
    }

    private getTypeShortName(typeName: string): string {
        const normalized = this.normalizeTypeName(typeName);
        const genericStart = normalized.indexOf('<');
        const plainName = genericStart >= 0 ? normalized.substring(0, genericStart) : normalized;
        const sections = plainName.split('.').filter(Boolean);
        return sections.length > 0 ? sections[sections.length - 1] : plainName;
    }

    private escapeRegExp(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

    private hasIFormFileParameter(lines: string[], methodLine: number): boolean {
        const signature = this.extractMethodSignature(lines, methodLine);
        if (!signature) {
            return false;
        }

        const parameterSection = this.extractParameterSection(signature);
        if (!parameterSection) {
            return false;
        }

        for (const rawParameter of this.splitParameters(parameterSection)) {
            const parsed = this.parseParameter(rawParameter);
            if (!parsed) {
                continue;
            }

            if (this.isIFormFileType(parsed.typeName)) {
                return true;
            }
        }

        return false;
    }

    private hasFromFormParameter(lines: string[], methodLine: number): boolean {
        const signature = this.extractMethodSignature(lines, methodLine);
        if (!signature) {
            return false;
        }

        const parameterSection = this.extractParameterSection(signature);
        if (!parameterSection) {
            return false;
        }

        for (const rawParameter of this.splitParameters(parameterSection)) {
            const parsed = this.parseParameter(rawParameter);
            if (!parsed) {
                continue;
            }

            if (parsed.source === 'form') {
                return true;
            }
        }

        return false;
    }

    private detectPreferredBodyMode(lines: string[], methodLine: number): 'json' | 'formdata' | 'binary' | undefined {
        if (this.hasIFormFileParameter(lines, methodLine)) {
            return 'binary';
        }

        if (this.hasFromFormParameter(lines, methodLine)) {
            return 'formdata';
        }

        return undefined;
    }

    private isIFormFileType(typeName: string): boolean {
        const normalized = typeName
            .replace(/\?/g, '')
            .replace(/^global::/i, '')
            .replace(/\s/g, '')
            .toLowerCase();

        return normalized === 'iformfile'
            || normalized === 'microsoft.aspnetcore.http.iformfile'
            || normalized === 'system.web.httppostedfilebase';
    }

    /**
     * 查找项目文件（公共静态方法，供外部调用）
     */
    public static async findProjectFile(filePath: string): Promise<string | undefined> {
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
