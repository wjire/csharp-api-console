/**
 * API 参数来源
 */
export enum ParameterSource {
    Path = 'Path',
    Query = 'Query',
    Body = 'Body',
    Header = 'Header'
}

/**
 * API 参数信息
 */
export interface ApiParameter {
    /** 参数名称 */
    name: string;
    /** 参数类型 */
    type: string;
    /** 参数来源 */
    source: ParameterSource;
    /** 是否必需 */
    required?: boolean;
}

/**
 * API 端点信息（扩展自 RouteInfo）
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
    /** 参数列表 */
    parameters: ApiParameter[];
}
