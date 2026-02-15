import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Base URL 配置管理器
 * 在插件启动时加载配置到内存，提供同步读取和异步写入功能
 */
export class BaseUrlConfigManager {
    private static readonly CONFIG_FILE_NAME = 'csharp-api-console-config.json';
    private configData: Record<string, string[]> = {}; // 内存中的配置数据
    private configFilePath: string;
    private writeTimer: NodeJS.Timeout | null = null;
    private readonly WRITE_DELAY = 500; // 防抖延迟（毫秒）

    /**
     * 构造函数
     * @param workspaceRoot 工作区根目录
     */
    constructor(workspaceRoot: string) {
        // 查找解决方案根目录（包含 .sln 文件的目录）
        const solutionRoot = workspaceRoot;

        // 构建配置文件路径
        const vscodeDir = path.join(solutionRoot, '.vscode');
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir, { recursive: true });
        }

        this.configFilePath = path.join(vscodeDir, BaseUrlConfigManager.CONFIG_FILE_NAME);

        // 加载配置到内存
        this.loadConfigToMemory();
    }

    /**
     * 从文件加载配置到内存
     */
    private loadConfigToMemory(): void {
        if (!fs.existsSync(this.configFilePath)) {
            this.configData = {};
            return;
        }

        try {
            const content = fs.readFileSync(this.configFilePath, 'utf-8');
            const config = JSON.parse(content);
            this.configData = config.baseUrls || {};
        } catch (error) {
            console.error('[BaseUrlConfigManager] Failed to load config:', error);
            this.configData = {};
        }
    }

    /**
     * 获取指定项目的 Base URLs（同步操作，从内存读取）
     */
    public getBaseUrls(projectPath: string): string[] {
        return this.configData[projectPath] || [];
    }

    /**
     * 保存指定项目的 Base URLs（同步更新内存，异步写入文件）
     */
    public saveBaseUrls(projectPath: string, baseUrls: string[]): void {
        // 1. 同步更新内存
        this.configData[projectPath] = baseUrls;

        // 2. 异步写入文件（防抖）
        this.scheduleFileWrite();
    }

    /**
     * 调度文件写入（防抖）
     */
    private scheduleFileWrite(): void {
        // 清除之前的定时器
        if (this.writeTimer) {
            clearTimeout(this.writeTimer);
        }

        // 设置新的定时器
        this.writeTimer = setTimeout(() => {
            this.writeConfigToFile();
            this.writeTimer = null;
        }, this.WRITE_DELAY);
    }

    /**
     * 写入配置到文件
     */
    private writeConfigToFile(): void {
        if (!this.configFilePath) {
            return;
        }

        try {
            const config = { baseUrls: this.configData };
            fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2), 'utf-8');
        } catch (error) {
            console.error('[BaseUrlConfigManager] Failed to write config:', error);
        }
    }

    /**
     * 获取所有项目的配置（用于调试）
     */
    public getAllConfig(): Record<string, string[]> {
        return { ...this.configData };
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        // 如果有待写入的数据，立即写入
        if (this.writeTimer) {
            clearTimeout(this.writeTimer);
            this.writeConfigToFile();
        }
    }
}
