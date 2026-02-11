import * as vscode from 'vscode';
import * as path from 'path';
import { ApiEndpointAnalyzer } from './apiEndpointAnalyzer';
import { LaunchSettingsReader } from './launchSettingsReader';

/**
 * 项目配置缓存管理器
 * 两层缓存架构：
 * - 第一层：Controller 目录 → 项目目录（永久缓存）
 * - 第二层：项目目录 → Base URL（可失效缓存，监听 launchSettings.json）
 */
export class ProjectConfigCache {
    // 第一层缓存：Controller 所在目录 → 项目目录
    private projectDirCache = new Map<string, string>();

    // 第二层缓存：项目目录 → Base URL
    private baseUrlCache = new Map<string, string | null>();

    /**
     * 获取 Base URL（带两层缓存）
     * @param controllerFilePath Controller 文件路径
     * @returns Base URL 或 null
     */
    async getBaseUrl(controllerFilePath: string): Promise<string | null> {
        try {
            // 第一层：获取项目目录（永久缓存）
            const projectDir = await this.getProjectDir(controllerFilePath);
            if (!projectDir) {
                return null;
            }

            // 第二层：获取 Base URL（可失效缓存）
            let baseUrl = this.baseUrlCache.get(projectDir);
            if (baseUrl === undefined) {
                // 缓存未命中，读取配置
                const projectPath = await this.findCsprojInDir(projectDir);
                baseUrl = LaunchSettingsReader.getBaseUrl(projectPath);

                // 存入缓存
                this.baseUrlCache.set(projectDir, baseUrl);
            }

            return baseUrl;
        } catch (error) {
            console.error('[ProjectConfigCache] Error getting base URL:', error);
            return null;
        }
    }

    /**
     * 第一层：获取项目目录（带缓存）
     */
    private async getProjectDir(controllerFilePath: string): Promise<string | null> {
        const dir = path.dirname(controllerFilePath);

        // 检查缓存
        let projectDir = this.projectDirCache.get(dir);
        if (projectDir) {
            return projectDir;
        }

        // 缓存未命中，查找项目文件
        const projectPath = await ApiEndpointAnalyzer.findProjectFile(controllerFilePath);
        if (!projectPath) {
            return null;
        }

        projectDir = path.dirname(projectPath);

        // 存入缓存（永久）
        this.projectDirCache.set(dir, projectDir);

        return projectDir;
    }

    /**
     * 在项目目录中查找 .csproj 文件
     */
    private async findCsprojInDir(projectDir: string): Promise<string | undefined> {
        try {
            const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(projectDir));
            const csprojFile = files.find(([name, type]) =>
                type === vscode.FileType.File && name.endsWith('.csproj')
            );

            if (csprojFile) {
                return path.join(projectDir, csprojFile[0]);
            }
        } catch (error) {
            console.error('[ProjectConfigCache] Error finding csproj:', error);
        }

        return undefined;
    }

    /**
     * 清除指定项目的 Base URL 缓存
     * @param launchSettingsPath launchSettings.json 文件路径
     */
    clearBaseUrlCacheByLaunchSettings(launchSettingsPath: string): void {
        // launchSettings.json 的路径格式：ProjectDir/Properties/launchSettings.json
        // 需要获取 ProjectDir
        const projectDir = path.dirname(path.dirname(launchSettingsPath));

        if (this.baseUrlCache.has(projectDir)) {
            this.baseUrlCache.delete(projectDir);
            console.log(`[ProjectConfigCache] Cleared Base URL cache for: ${projectDir}`);
        }
    }

    /**
     * 清空所有缓存
     */
    clearAllCache(): void {
        this.projectDirCache.clear();
        this.baseUrlCache.clear();
        console.log('[ProjectConfigCache] All cache cleared');
    }
}
