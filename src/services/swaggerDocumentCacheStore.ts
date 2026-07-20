import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export type CachedSwaggerDocument = {
    updatedAt: number;
    sourceUrl: string;
    document: Record<string, unknown>;
};

type SwaggerCacheFilePayload = {
    version: 1;
    updatedAt: number;
    sourceUrl: string;
    document: Record<string, unknown>;
};

export class SwaggerDocumentCacheStore {
    private static readonly cacheDirName = '.vscode';
    private static readonly cacheFilePrefix = 'csharp-api-console-swagger-cache';

    public load(projectPath: string): CachedSwaggerDocument | null {
        const cacheFilePath = this.getCacheFilePath(projectPath);
        if (!cacheFilePath || !fs.existsSync(cacheFilePath)) {
            return null;
        }

        try {
            const raw = fs.readFileSync(cacheFilePath, 'utf8');
            const parsed = JSON.parse(raw) as Partial<SwaggerCacheFilePayload>;
            if (!parsed || typeof parsed !== 'object') {
                return null;
            }

            if (parsed.version !== 1) {
                return null;
            }

            if (!parsed.document || typeof parsed.document !== 'object' || Array.isArray(parsed.document)) {
                return null;
            }

            return {
                updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
                sourceUrl: typeof parsed.sourceUrl === 'string' ? parsed.sourceUrl : '',
                document: parsed.document as Record<string, unknown>
            };
        } catch {
            return null;
        }
    }

    public save(projectPath: string, sourceUrl: string, document: Record<string, unknown>): void {
        const cacheFilePath = this.getCacheFilePath(projectPath);
        if (!cacheFilePath) {
            return;
        }

        try {
            const cacheDir = path.dirname(cacheFilePath);
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }

            const payload: SwaggerCacheFilePayload = {
                version: 1,
                updatedAt: Date.now(),
                sourceUrl: sourceUrl || '',
                document
            };

            fs.writeFileSync(cacheFilePath, JSON.stringify(payload, null, 2), 'utf8');
        } catch {
            // Ignore cache write failures to avoid affecting normal mock flow.
        }
    }

    private getCacheFilePath(projectPath: string): string {
        const normalizedProjectPath = (projectPath || '').trim();
        if (!normalizedProjectPath) {
            return '';
        }

        const projectDir = path.dirname(normalizedProjectPath);
        if (!projectDir) {
            return '';
        }

        const cacheDir = path.join(projectDir, SwaggerDocumentCacheStore.cacheDirName);
        const cacheFileName = `${SwaggerDocumentCacheStore.cacheFilePrefix}-${this.hashProjectPath(normalizedProjectPath)}.json`;
        return path.join(cacheDir, cacheFileName);
    }

    private hashProjectPath(projectPath: string): string {
        return crypto
            .createHash('sha1')
            .update(projectPath.toLowerCase())
            .digest('hex')
            .slice(0, 12);
    }
}
