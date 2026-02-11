/**
 * API 端点信息
 */
export interface ApiEndpoint {
    /** HTTP 方法 */
    httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY';
    /** 路由模板，如：/api/users/{id} */
    routeTemplate: string;
    /** 完整 URL（包含 base URL） */
    fullUrl?: string;
    /** 控制器名称 */
    controller: string;
    /** Action 方法名称 */
    action: string;
    /** 文件路径 */
    filePath: string;
    /** 行号 */
    lineNumber: number;
    /** 项目路径 */
    projectPath?: string;
}
