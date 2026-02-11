/**
 * HTTP 请求选项
 */
export interface HttpRequestOptions {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
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

            // 准备请求选项
            const requestOptions: any = {
                method: options.method,
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.path,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            };

            // 如果有 body，设置 Content-Length
            if (options.body) {
                requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
            }

            // 发送请求
            const response = await new Promise<{
                statusCode: number;
                headers: Record<string, string>;
                body: string;
            }>((resolve, reject) => {
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

                // 写入 body
                if (options.body) {
                    req.write(options.body);
                }

                req.end();
            });

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
