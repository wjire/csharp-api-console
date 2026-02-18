/**
 * HTTP 请求选项
 */
export interface FormDataField {
    key: string;
    type: 'text' | 'file';
    value?: string;
    valueBase64?: string;
    fileName?: string;
    contentType?: string;
}

export interface HttpRequestOptions {
    method: string;
    url: string;
    headers: Record<string, string>;
    timeoutMs?: number;
    body?: string;
    bodyMode?: 'json' | 'formdata' | 'binary';
    binaryBodyBase64?: string;
    binaryContentType?: string;
    binaryFileName?: string;
    formDataFields?: FormDataField[];
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
    private escapeDispositionValue(value: string): string {
        return value.replace(/"/g, '\\"').replace(/\r/g, '').replace(/\n/g, '');
    }

    private buildMultipartFormData(fields: FormDataField[]): { boundary: string; body: Buffer } {
        const boundary = `----CSharpApiConsole${Date.now().toString(16)}`;
        const chunks: Buffer[] = [];

        for (const field of fields) {
            const key = this.escapeDispositionValue(field.key);

            if (field.type === 'file') {
                if (!field.valueBase64) {
                    continue;
                }

                const fileName = this.escapeDispositionValue(field.fileName || 'upload.bin');
                const contentType = field.contentType || 'application/octet-stream';
                const fileBuffer = Buffer.from(field.valueBase64, 'base64');

                chunks.push(Buffer.from(
                    `--${boundary}\r\n`
                    + `Content-Disposition: form-data; name="${key}"; filename="${fileName}"\r\n`
                    + `Content-Type: ${contentType}\r\n\r\n`,
                    'utf-8'
                ));
                chunks.push(fileBuffer);
                chunks.push(Buffer.from('\r\n', 'utf-8'));
                continue;
            }

            const value = field.value || '';
            chunks.push(Buffer.from(
                `--${boundary}\r\n`
                + `Content-Disposition: form-data; name="${key}"\r\n\r\n`
                + `${value}\r\n`,
                'utf-8'
            ));
        }

        chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'));
        return {
            boundary,
            body: Buffer.concat(chunks)
        };
    }

    private sendRawRequest(httpModule: any, requestOptions: any, timeoutMs?: number, payload?: string | Buffer): Promise<{
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

            if (timeoutMs && Number.isFinite(timeoutMs) && timeoutMs > 0) {
                req.setTimeout(timeoutMs, () => {
                    req.destroy(new Error(`Request timeout (${Math.floor(timeoutMs / 1000)}s)`));
                });
            }

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
        const timeoutMs = options.timeoutMs && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
            ? Math.floor(options.timeoutMs)
            : undefined;

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
            const formDataPayload = options.bodyMode === 'formdata' && options.formDataFields?.length
                ? this.buildMultipartFormData(options.formDataFields)
                : undefined;
            const hasPayload = Boolean(binaryBuffer) || Boolean(options.body) || Boolean(formDataPayload);
            const requestHeaders: Record<string, string> = { ...options.headers };
            const hasContentTypeHeader = Object.keys(requestHeaders).some(
                key => key.toLowerCase() === 'content-type'
            );
            const shouldUseMultipartFirst = options.bodyMode === 'binary' && binaryBuffer && !hasContentTypeHeader;

            if (hasPayload && !hasContentTypeHeader) {
                if (formDataPayload) {
                    requestHeaders['Content-Type'] = `multipart/form-data; boundary=${formDataPayload.boundary}`;
                } else if (!shouldUseMultipartFirst) {
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
            if (formDataPayload) {
                requestOptions.headers['Content-Length'] = formDataPayload.body.length;
            } else if (!shouldUseMultipartFirst && binaryBuffer) {
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

                response = await this.sendRawRequest(httpModule, multipartRequestOptions, timeoutMs, multipartBody);

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

                    response = await this.sendRawRequest(httpModule, rawBinaryRequestOptions, timeoutMs, binaryBuffer);
                }
            } else {
                // 非 binary 或用户已显式指定 Content-Type 时，沿用常规发送
                response = await this.sendRawRequest(
                    httpModule,
                    requestOptions,
                    timeoutMs,
                    formDataPayload?.body || binaryBuffer || options.body
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
