import * as vscode from 'vscode';

/**
 * API 路由构造器
 * 负责拼接控制器路由、Action 路由并处理版本占位符
 */
export class ApiRouteBuilder {
    // ApiVersion 缓存：Key = filePath + controllerName, Value = version | null
    // 避免同一个控制器的多个 action 重复查找
    private apiVersionCache = new Map<string, string | null>();

    /**
     * 构建完整路由
     */
    public buildFullRoute(
        controllerRoute: string | null,
        actionRoute: string,
        controllerName: string,
        actionName: string,
        lines: string[],
        methodLine: number,
        filePath: string
    ): string {
        let route = '';

        // 处理控制器路由
        if (controllerRoute) {
            route = controllerRoute;

            // 替换 [controller] 占位符（转小写，符合 ASP.NET Core 约定）
            const controllerShortName = controllerName.replace(/Controller$/, '').toLowerCase();
            route = route.replace(/\[controller\]/gi, controllerShortName);

            // 替换 [action] 占位符（去掉 Async 后缀 + 转小写）
            const actionShortName = actionName.replace(/Async$/i, '').toLowerCase();
            route = route.replace(/\[action\]/gi, actionShortName);
        }

        // 拼接 Action 路由
        if (actionRoute) {
            if (route) {
                route = `${route}/${actionRoute}`;
            } else {
                route = actionRoute;
            }
        }

        // ⚡ 替换 API 版本占位符 {version:apiVersion}, {v:apiVersion} 等
        route = this.replaceApiVersionPlaceholder(route, lines, methodLine, controllerName, filePath);

        // 确保以 / 开头
        if (route && !route.startsWith('/')) {
            route = '/' + route;
        }

        return route || '/';
    }

    /**
     * 替换路由中的 API 版本占位符
     * 支持任意变量名 + :apiVersion 约束，如 {version:apiVersion}, {v:apiVersion} 等
     */
    private replaceApiVersionPlaceholder(
        route: string,
        lines: string[],
        methodLine: number,
        controllerName: string,
        filePath: string
    ): string {
        // 匹配任意形式的 API 版本占位符：{xxx:apiVersion}
        const apiVersionRegex = /\{\w+:apiVersion\}/gi;

        if (!apiVersionRegex.test(route)) {
            return route;
        }

        // 1. 优先：查找 [ApiVersion("x.x")] 特性（带缓存）
        const apiVersion = this.findApiVersionAttribute(lines, methodLine, controllerName, filePath);

        if (apiVersion) {
            return route.replace(apiVersionRegex, apiVersion);
        }

        // 2. 其次：使用配置的默认版本
        const config = vscode.workspace.getConfiguration('csharpApiConsole');
        const defaultVersion = config.get<string>('defaultApiVersion', '1.0');

        // 3. 如果配置为空字符串，保持占位符不替换
        if (defaultVersion === '') {
            return route;
        }

        return route.replace(apiVersionRegex, defaultVersion);
    }

    /**
     * 查找 [ApiVersion("x.x")] 特性（带缓存）
     * 在控制器类定义附近查找（向上最多查找 20 行）
     */
    private findApiVersionAttribute(
        lines: string[],
        methodLine: number,
        controllerName: string,
        filePath: string
    ): string | null {
        const cacheKey = `${filePath}:${controllerName}`;
        if (this.apiVersionCache.has(cacheKey)) {
            return this.apiVersionCache.get(cacheKey)!;
        }

        for (let i = methodLine; i >= 0 && i >= methodLine - 50; i--) {
            const line = lines[i].trim();

            if (/\bclass\s+\w+Controller/.test(line)) {
                for (let j = i - 1; j >= 0 && j >= i - 20; j--) {
                    const attrLine = lines[j].trim();

                    if (this.isCommentedLine(lines, j)) {
                        continue;
                    }

                    const match = attrLine.match(/\[ApiVersion\s*\(\s*["']([\d.]+)["']/i);
                    if (match) {
                        const version = match[1];
                        this.apiVersionCache.set(cacheKey, version);
                        return version;
                    }

                    if (/\bclass\b/.test(attrLine)) {
                        break;
                    }
                }
                break;
            }
        }

        this.apiVersionCache.set(cacheKey, null);
        return null;
    }

    /**
     * 检查是否是被注释的行
     * 支持单行注释 (//) 和多行注释 (slash-star star-slash)
     */
    private isCommentedLine(lines: string[], lineIndex: number): boolean {
        const line = lines[lineIndex];
        const trimmed = line.trim();

        if (trimmed.startsWith('//')) {
            return true;
        }

        let inComment = false;
        for (let i = lineIndex; i >= 0 && i >= lineIndex - 10; i--) {
            const checkLine = lines[i];

            if (checkLine.includes('*/')) {
                inComment = false;
            }

            if (checkLine.includes('/*')) {
                inComment = true;
                break;
            }
        }

        return inComment;
    }
}
