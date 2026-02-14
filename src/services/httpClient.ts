/**
 * HTTP 请求选项
 */
export interface HttpRequestOptions {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    bodyMode?: 'json' | 'binary';
    binaryBodyBase64?: string;
    binaryContentType?: string;
    binaryFileName?: string;
}

/**
 * HTTP 响应结果
 */
export interface HttpResponse {
    success: boolean;
    statusCode?: number;
    headers?: Record<string, string>;
    body?: string;
    error?: string;
    duration: number;
}

/**
 * HTTP 客户端服务
 * 负责发送 HTTP 请求并返回响应
 */
export class HttpClient {
    private sendRawRequest(httpModule: any, requestOptions: any, payload?: string | Buffer): Promise<{
        statusCode: number;
        headers: Record<string, string>;
        body: string;
    }> {
        return new Promise((resolve, reject) => {
            const req = httpModule.request(requestOptions, (res: any) => {
                let body = '';

                res.on('data', (chunk: any) => {
                    body += chunk;
                });

                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body
                    });
                });
            });

            req.on('error', (error: Error) => {
                reject(error);
            });

            if (payload !== undefined) {
                req.write(payload);
            }

            req.end();
        });
    }

    /**
     * 发送 HTTP 请求
     * @param options 请求选项
     * @returns HTTP 响应（包含成功/失败状态、响应数据、耗时等）
     */
    async sendRequest(options: HttpRequestOptions): Promise<HttpResponse> {
        const startTime = Date.now();

        try {
            const https = require('https');
            const http = require('http');
            const urlModule = require('url');

            const parsedUrl = urlModule.parse(options.url);
            const isHttps = parsedUrl.protocol === 'https:';
            const httpModule = isHttps ? https : http;
            const binaryBuffer = options.bodyMode === 'binary' && options.binaryBodyBase64
                ? Buffer.from(options.binaryBodyBase64, 'base64')
                : undefined;
            const hasPayload = Boolean(binaryBuffer) || Boolean(options.body);
            const requestHeaders: Record<string, string> = { ...options.headers };
            const hasContentTypeHeader = Object.keys(requestHeaders).some(
                key => key.toLowerCase() === 'content-type'
            );
            const shouldUseMultipartFirst = options.bodyMode === 'binary' && binaryBuffer && !hasContentTypeHeader;

            if (hasPayload && !hasContentTypeHeader) {
                if (!shouldUseMultipartFirst) {
                    requestHeaders['Content-Type'] = options.bodyMode === 'binary'
                        ? (options.binaryContentType || 'application/octet-stream')
                        : 'application/json';
                }
            }

            // 准备请求选项
            const requestOptions: any = {
                method: options.method,
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.path,
                headers: requestHeaders
            };

            // 如果有 body，设置 Content-Length（multipart 模式会在构建 multipart body 后单独设置）
            if (!shouldUseMultipartFirst && binaryBuffer) {
                requestOptions.headers['Content-Length'] = binaryBuffer.length;
            } else if (options.body) {
                requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
            }

            let response;

            // Binary 默认优先使用 multipart/form-data（兼容 ASP.NET Core IFormFile）
            if (shouldUseMultipartFirst) {
                const boundary = `----CSharpApiConsole${Date.now().toString(16)}`;
                const fileName = options.binaryFileName || 'upload.bin';
                const fileContentType = options.binaryContentType || 'application/octet-stream';

                const multipartPrefix = Buffer.from(
                    `--${boundary}\r\n`
                    + `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`
                    + `Content-Type: ${fileContentType}\r\n\r\n`,
                    'utf-8'
                );
                const multipartSuffix = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
                const multipartBody = Buffer.concat([multipartPrefix, binaryBuffer, multipartSuffix]);

                const multipartHeaders: Record<string, string> = { ...options.headers };
                multipartHeaders['Content-Type'] = `multipart/form-data; boundary=${boundary}`;

                const multipartRequestOptions: any = {
                    ...requestOptions,
                    headers: {
                        ...multipartHeaders,
                        'Content-Length': multipartBody.length
                    }
                };

                response = await this.sendRawRequest(httpModule, multipartRequestOptions, multipartBody);

                // multipart 失败且为 415 时，回退 raw binary
                if (response.statusCode === 415) {
                    const rawBinaryHeaders: Record<string, string> = { ...options.headers };
                    rawBinaryHeaders['Content-Type'] = options.binaryContentType || 'application/octet-stream';

                    const rawBinaryRequestOptions: any = {
                        ...requestOptions,
                        headers: {
                            ...rawBinaryHeaders,
                            'Content-Length': binaryBuffer.length
                        }
                    };

                    response = await this.sendRawRequest(httpModule, rawBinaryRequestOptions, binaryBuffer);
                }
            } else {
                // 非 binary 或用户已显式指定 Content-Type 时，沿用常规发送
                response = await this.sendRawRequest(
                    httpModule,
                    requestOptions,
                    binaryBuffer || options.body
                );
            }

            const duration = Date.now() - startTime;

            return {
                success: true,
                statusCode: response.statusCode,
                headers: response.headers,
                body: response.body,
                duration
            };

        } catch (error: any) {
            const duration = Date.now() - startTime;

            return {
                success: false,
                error: error.message,
                duration
            };
        }
    }
}
