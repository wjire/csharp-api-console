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
        if (!projectPath) {
            return null;
        }

        const projectDir = path.dirname(projectPath);
        const launchSettingsPath = path.join(projectDir, 'Properties', 'launchSettings.json');

        if (!fs.existsSync(launchSettingsPath)) {
            return null;
        }

        try {
            let content = fs.readFileSync(launchSettingsPath, 'utf8');

            // 去除 BOM 头（如果有）
            if (content.charCodeAt(0) === 0xFEFF) {
                content = content.slice(1);
            }

            // 移除单行注释（以 // 开头的行）
            content = this.removeComments(content);

            // 解析 JSON
            const json = JSON.parse(content);
            const profiles = json.profiles ?? {};

            // 找到 commandName = "Project" 的 profile
            const projectProfile = Object.values(profiles).find(
                (p: any) => p.commandName === 'Project'
            ) as any;

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
            console.error('读取 launchSettings.json 失败:', error);
            return null;
        }
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
