import * as path from 'path';
import * as fs from 'fs';

/**
 * launchSettings.json 配置读取器
 */
export class LaunchSettingsReader {
    /**
     * 从项目路径读取 launchSettings.json 并获取 Base URL
     * @param projectPath .csproj 文件路径
     * @returns Base URL (如：http://localhost:5000) 或 null
     */
    static getBaseUrl(projectPath: string | undefined): string | null {
        try {
            const projectProfile = this.getProjectProfile(projectPath);
            if (!projectProfile) {
                return null;
            }

            // 获取 applicationUrl
            const raw = projectProfile.applicationUrl;
            if (!raw) {
                return null;
            }

            const urls: string[] = raw.split(';')
                .map((u: string) => u.trim())
                .filter((u: string) => u.length > 0);

            if (urls.length === 0) {
                return null;
            }

            // 优先选择 http:// URL，然后是 https://
            const httpUrl = urls.find(u => u.startsWith('http://'));
            const httpsUrl = urls.find(u => u.startsWith('https://'));
            const chosen = httpUrl ?? httpsUrl ?? null;

            if (!chosen) {
                return null;
            }

            try {
                const url = new URL(chosen);

                // localhost 保留
                if (url.hostname === 'localhost') {
                    return url.toString().replace(/\/$/, '');
                }

                // 真实 IPv4 保留
                if (this.isRealIPv4(url.hostname)) {
                    return url.toString().replace(/\/$/, '');
                }

                // 其他情况（如 0.0.0.0）替换成 localhost
                url.hostname = 'localhost';
                return url.toString().replace(/\/$/, '');

            } catch {
                return null;
            }
        } catch (error) {
            console.error('Failed to read launchSettings.json:', error);
            return null;
        }
    }

    /**
     * 从 launchSettings.json 读取 commandName=Project 的环境变量
     * @param projectPath .csproj 文件路径
     * @returns 环境变量键值对
     */
    static getEnvironmentVariables(projectPath: string | undefined): Record<string, string> {
        try {
            const projectProfile = this.getProjectProfile(projectPath);
            if (!projectProfile) {
                return {};
            }

            const rawEnv = projectProfile.environmentVariables;
            if (!rawEnv || typeof rawEnv !== 'object') {
                return {};
            }

            const env: Record<string, string> = {};
            for (const [key, value] of Object.entries(rawEnv as Record<string, unknown>)) {
                if (!key || value === undefined || value === null) {
                    continue;
                }

                env[key] = String(value);
            }

            return env;
        } catch (error) {
            console.error('Failed to read launchSettings.json environment variables:', error);
            return {};
        }
    }

    /**
     * 获取 launchSettings.json 中 commandName=Project 的 profile
     */
    private static getProjectProfile(projectPath: string | undefined): any | null {
        const json = this.readLaunchSettings(projectPath);
        if (!json) {
            return null;
        }

        const profiles = json.profiles ?? {};
        const projectProfile = Object.values(profiles).find(
            (p: any) => p.commandName === 'Project'
        ) as any;

        return projectProfile || null;
    }

    /**
     * 读取并解析 launchSettings.json（支持 BOM 与整行注释）
     */
    private static readLaunchSettings(projectPath: string | undefined): any | null {
        if (!projectPath) {
            return null;
        }

        const projectDir = path.dirname(projectPath);
        const launchSettingsPath = path.join(projectDir, 'Properties', 'launchSettings.json');

        if (!fs.existsSync(launchSettingsPath)) {
            return null;
        }

        let content = fs.readFileSync(launchSettingsPath, 'utf8');

        if (content.charCodeAt(0) === 0xFEFF) {
            content = content.slice(1);
        }

        content = this.removeComments(content);
        return JSON.parse(content);
    }

    /**
     * 移除 JSON 文件中的单行注释（以 // 开头的行）
     */
    private static removeComments(content: string): string {
        return content
            .split('\n')
            .filter(line => {
                const trimmed = line.trim();
                // 保留非注释行
                return !trimmed.startsWith('//');
            })
            .join('\n');
    }

    /**
     * 判断是否是真实的 IPv4 地址（排除通配地址）
     */
    private static isRealIPv4(host: string): boolean {
        // 排除通配地址
        if (host === '0.0.0.0') {
            return false;
        }

        const parts = host.split('.');
        if (parts.length !== 4) {
            return false;
        }

        return parts.every(p => {
            const n = Number(p);
            return n >= 0 && n <= 255 && /^\d+$/.test(p);
        });
    }
}
