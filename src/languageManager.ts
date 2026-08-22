import * as vscode from 'vscode';

/**
 * 语言类型
 */
type Language = 'zh-cn' | 'en';

/**
 * 文本键类型
 */
type TextKey = keyof typeof TEXT_MAP['zh-cn'];

/**
 * 中英文文本映射
 */
const TEXT_MAP = {
    'zh-cn': {
        // 通用
        'extension.activated': 'C# API Console 插件已激活',
        'extension.deactivated': 'C# API Console 插件已停用',
        'error.noWorkspace': '请先打开一个工作区',
        'error.noProjectFile': '无法找到项目文件',
        'error.cannotOpenFile': '无法打开文件',

        // WebView - 按钮和标签
        'webview.send': '发送',
        'webview.add': '添加',
        'webview.cancel': '取消',
        'webview.save': '保存',
        'webview.delete': '删除',
        'webview.remove': '移除',
        'webview.backToAction': '返回',
        'webview.backToActionUnavailable': '当前接口无法定位到 Action 代码位置',
        'webview.backToActionFailed': '返回 Action 位置失败',
        'webview.debug.start': '启动调试',
        'webview.debug.starting': '启动中...',
        'webview.debug.running': '调试中',
        'webview.debug.started': '调试已启动',
        'webview.debug.alreadyRunning': '调试会话已在运行',
        'webview.debug.failed': '启动调试失败',
        'webview.debug.noProject': '缺少项目路径，无法启动调试',
        'webview.debug.building': '正在构建 Debug...',
        'webview.debug.buildFailed': '构建失败，已取消启动调试',
        'webview.debug.buildDebugFirst': '请先构建 Debug{0}，未找到目标程序集：{1}',

        // WebView - 标签页
        'webview.tab.headers': 'Headers',
        'webview.tab.auth': 'Auth',
        'webview.tab.query': 'Query',
        'webview.tab.body': 'Body',
        'webview.tab.response': 'Response',
        'webview.bodyMode.json': 'JSON',
        'webview.bodyMode.formData': 'FormData',
        'webview.bodyMode.binary': 'Binary',
        'webview.bodyMode.formDataContentType': 'Content-Type: multipart/form-data',
        'webview.bodyMode.formDataHeaderUse': '启用',
        'webview.bodyMode.formDataHeaderKey': 'Key',
        'webview.bodyMode.formDataHeaderType': '类型',
        'webview.bodyMode.formDataHeaderValue': '值',
        'webview.bodyMode.formDataHeaderActions': '操作',
        'webview.bodyMode.formDataTypeText': 'Text',
        'webview.bodyMode.formDataTypeFile': 'File',
        'webview.bodyMode.formDataAddRow': '添加行',
        'webview.bodyMode.formDataClearDisabled': '清理未启用项',
        'webview.bodyMode.formDataClearFile': '清空',
        'webview.bodyMode.formDataEmpty': 'FormData 没有可发送的有效字段',
        'webview.bodyMode.mock': 'Mock',
        'webview.bodyMode.mockTooltip': '仅使用本地 Swagger 缓存生成 Query / Body / FormData Mock 数据',
        'webview.bodyMode.mocking': '生成中...',
        'webview.bodyMode.mockLoadedSwaggerUrl': '已根据本地 Swagger 缓存生成 Mock 数据',
        'webview.bodyMode.mockFailed': '未能从 Swagger 生成 Mock 数据',
        'webview.bodyMode.mockNoEndpoint': '当前接口信息不可用，无法生成 Mock 数据',
        'webview.bodyMode.mockNotSupportedMethod': 'GET 请求不需要生成 Body',
        'webview.bodyMode.mockConfirmOverwrite': 'Body 已有内容，是否用 Mock 结果覆盖？',
        'webview.bodyMode.mockSkipWhenBodyExists': 'Body 已有内容。如需生成 Mock，请先清空 Body。',
        'webview.bodyMode.swaggerSync': '同步 Swagger',
        'webview.bodyMode.swaggerUpdate': '更新 Swagger',
        'webview.bodyMode.swaggerSyncing': '同步中...',
        'webview.bodyMode.swaggerSyncTooltip': '从当前 Base URL 获取 Swagger/OpenAPI 文档并更新项目缓存',
        'webview.bodyMode.swaggerSyncSuccess': 'Swagger 同步成功',
        'webview.bodyMode.swaggerSyncFailed': 'Swagger 同步失败',
        'webview.bodyMode.swaggerSyncNoProject': '当前项目信息不可用，无法同步 Swagger',
        'webview.bodyMode.formatJson': '格式化',
        'webview.bodyMode.invalidJson': 'JSON 无效',
        'webview.bodyMode.binaryFile': '二进制文件',
        'webview.bodyMode.selectFile': '选择文件',
        'webview.bodyMode.noFile': '未选择任何文件',

        // WebView - 输入框
        'webview.placeholder.baseUrl': '选择 Base URL',
        'webview.placeholder.route': '/api/route',
        'webview.placeholder.token': 'token（Bearer 前缀可选）',
        'webview.placeholder.body': '在此输入 JSON body...',
        'webview.placeholder.key': 'Key',
        'webview.placeholder.value': 'Value',
        'webview.placeholder.parameter': 'parameter',
        'webview.placeholder.baseUrlInput': 'https://api.example.com',
        'webview.placeholder.queryString': '粘贴 URL 或查询字符串（如 ?id=1&name=dankit，? 可选），将自动同步到下方参数行；编辑下方参数行也会同步到这里',
        'webview.query.parseFailed': '未识别到有效查询参数',
        // WebView - 状态栏
        'webview.status.label': '状态:',
        'webview.size.label': '大小:',
        'webview.time.label': '耗时:',
        'webview.status.sending': '正在发送...',
        'webview.response.copyOpen': '打开',
        'webview.response.empty': '暂无响应内容可打开',

        // WebView - Base URL 管理
        'webview.baseUrl.manage': '管理 Base URLs',
        'webview.baseUrl.add': '+ 添加 Base URL',
        'webview.baseUrl.empty': '暂无 Base URL，点击"+ 添加 Base URL"添加一个',
        'webview.baseUrl.saved': 'Base URLs 已保存',

        // WebView - Auth
        'webview.auth.bearer': 'Bearer',
        'webview.auth.basic': 'Basic',
        'webview.auth.oauth2': 'OAuth 2',

        // WebView - 错误信息
        'webview.error.requestFailed': '请求失败',
        'webview.error.invalidJson': 'JSON 格式错误',
        'webview.error.networkError': '网络错误',

        // Mock Service - 错误信息
        'mock.error.missingHttpMethod': '缺少 HTTP 方法。',
        'mock.error.missingRouteTemplate': '缺少路由模板。',
        'mock.error.missingSwaggerBaseUrl': '缺少用于获取 Swagger 的 Base URL。',
        'mock.error.swaggerCacheMissing': '本地没有 Swagger 缓存，请先点击“同步 Swagger”拉取。',
        'mock.error.swaggerCacheNeedsUpdate': '无法从本地 Swagger 缓存生成 Mock 数据，请点击“更新 Swagger”后重试。',
        'mock.error.unableToLoadSchema': '无法从 Swagger 地址加载 Mock schema：{0}',
        'mock.error.invalidUrl': 'URL 无效。',
        'mock.error.requestTimedOut': '请求超时。',
        'mock.error.httpStatus': 'HTTP 请求失败：{0}',
    },
    'en': {
        // Common
        'extension.activated': 'C# API Explorer activated',
        'extension.deactivated': 'C# API Explorer deactivated',
        'error.noWorkspace': 'Please open a workspace first',
        'error.noProjectFile': 'Cannot find project file',
        'error.cannotOpenFile': 'Cannot open file',

        // WebView - Buttons and Labels
        'webview.send': 'Send',
        'webview.add': 'Add',
        'webview.cancel': 'Cancel',
        'webview.save': 'Save',
        'webview.delete': 'Delete',
        'webview.remove': 'Remove',
        'webview.backToAction': 'Back',
        'webview.backToActionUnavailable': 'Cannot locate the action source for current API',
        'webview.backToActionFailed': 'Failed to navigate back to action source',
        'webview.debug.start': 'Start Debug',
        'webview.debug.starting': 'Starting...',
        'webview.debug.running': 'Debug Running',
        'webview.debug.started': 'Debug session started',
        'webview.debug.alreadyRunning': 'Debug session is already running',
        'webview.debug.failed': 'Failed to start debugging',
        'webview.debug.noProject': 'Missing project path, cannot start debugging',
        'webview.debug.building': 'Building Debug...',
        'webview.debug.buildFailed': 'Build failed. Debug launch was canceled',
        'webview.debug.buildDebugFirst': 'Please build Debug{0} first. Target assembly not found: {1}',

        // WebView - Tabs
        'webview.tab.headers': 'Headers',
        'webview.tab.auth': 'Auth',
        'webview.tab.query': 'Query',
        'webview.tab.body': 'Body',
        'webview.tab.response': 'Response',
        'webview.bodyMode.json': 'JSON',
        'webview.bodyMode.formData': 'FormData',
        'webview.bodyMode.binary': 'Binary',
        'webview.bodyMode.formDataContentType': 'Content-Type: multipart/form-data',
        'webview.bodyMode.formDataHeaderUse': 'Use',
        'webview.bodyMode.formDataHeaderKey': 'Key',
        'webview.bodyMode.formDataHeaderType': 'Type',
        'webview.bodyMode.formDataHeaderValue': 'Value',
        'webview.bodyMode.formDataHeaderActions': 'Actions',
        'webview.bodyMode.formDataTypeText': 'Text',
        'webview.bodyMode.formDataTypeFile': 'File',
        'webview.bodyMode.formDataAddRow': 'Add Row',
        'webview.bodyMode.formDataClearDisabled': 'Clear Disabled',
        'webview.bodyMode.formDataClearFile': 'Clear',
        'webview.bodyMode.formDataEmpty': 'FormData has no valid fields',
        'webview.bodyMode.mock': 'Mock',
        'webview.bodyMode.mockTooltip': 'Generate Query / Body / FormData mock data from the local Swagger cache only',
        'webview.bodyMode.mocking': 'Mocking...',
        'webview.bodyMode.mockLoadedSwaggerUrl': 'Mock data generated from the local Swagger cache',
        'webview.bodyMode.mockFailed': 'Failed to generate mock data from Swagger',
        'webview.bodyMode.mockNoEndpoint': 'No API endpoint available for mock generation',
        'webview.bodyMode.mockNotSupportedMethod': 'GET request does not need body mock',
        'webview.bodyMode.mockConfirmOverwrite': 'Body already has content. Replace with mock body?',
        'webview.bodyMode.mockSkipWhenBodyExists': 'Body already has content. Clear it first if you want to generate mock body.',
        'webview.bodyMode.swaggerSync': 'Sync Swagger',
        'webview.bodyMode.swaggerUpdate': 'Update Swagger',
        'webview.bodyMode.swaggerSyncing': 'Syncing...',
        'webview.bodyMode.swaggerSyncTooltip': 'Fetch the Swagger/OpenAPI document from the current Base URL and update the project cache',
        'webview.bodyMode.swaggerSyncSuccess': 'Swagger synchronized successfully',
        'webview.bodyMode.swaggerSyncFailed': 'Failed to synchronize Swagger',
        'webview.bodyMode.swaggerSyncNoProject': 'No project is available for Swagger synchronization',
        'webview.bodyMode.formatJson': 'Format',
        'webview.bodyMode.invalidJson': 'Invalid JSON',
        'webview.bodyMode.binaryFile': 'Binary File',
        'webview.bodyMode.selectFile': 'Select file',
        'webview.bodyMode.noFile': 'No file selected',

        // WebView - Placeholders
        'webview.placeholder.baseUrl': 'Select Base URL',
        'webview.placeholder.route': '/api/route',
        'webview.placeholder.token': 'token (Bearer prefix optional)',
        'webview.placeholder.body': 'Enter JSON body here...',
        'webview.placeholder.key': 'Key',
        'webview.placeholder.value': 'Value',
        'webview.placeholder.parameter': 'parameter',
        'webview.placeholder.baseUrlInput': 'https://api.example.com',
        'webview.placeholder.queryString': 'Paste a URL or query string (e.g., ?id=1&name=dankit, ? optional). It will auto-sync to rows below, and row edits will sync back here',
        'webview.query.parseFailed': 'No valid query parameters found',
        // WebView - Status Bar
        'webview.status.label': 'Status:',
        'webview.size.label': 'Size:',
        'webview.time.label': 'Time:',
        'webview.status.sending': 'Sending...',
        'webview.response.copyOpen': 'Open',
        'webview.response.empty': 'No response content to open',

        // WebView - Base URL Management
        'webview.baseUrl.manage': 'Manage Base URLs',
        'webview.baseUrl.add': '+ Add Base URL',
        'webview.baseUrl.empty': 'No Base URLs yet. Click "+ Add Base URL" to add one.',
        'webview.baseUrl.saved': 'Base URLs saved',

        // WebView - Auth
        'webview.auth.bearer': 'Bearer',
        'webview.auth.basic': 'Basic',
        'webview.auth.oauth2': 'OAuth 2',

        // WebView - Error Messages
        'webview.error.requestFailed': 'Request failed',
        'webview.error.invalidJson': 'Invalid JSON format',
        'webview.error.networkError': 'Network error',

        // Mock Service - Error Messages
        'mock.error.missingHttpMethod': 'Missing HTTP method.',
        'mock.error.missingRouteTemplate': 'Missing route template.',
        'mock.error.missingSwaggerBaseUrl': 'Missing base URL for Swagger fetch.',
        'mock.error.swaggerCacheMissing': 'No local Swagger cache is available. Click Sync Swagger to fetch it first.',
        'mock.error.swaggerCacheNeedsUpdate': 'Unable to generate mock data from the local Swagger cache. Click Update Swagger and try again.',
        'mock.error.unableToLoadSchema': 'Unable to load mock schema from Swagger URL(s): {0}',
        'mock.error.invalidUrl': 'Invalid URL.',
        'mock.error.requestTimedOut': 'Request timed out.',
        'mock.error.httpStatus': 'HTTP request failed: {0}',
    }
};

/**
 * 语言管理器
 * 根据 VSCode 语言环境自动选择中文或英文
 */
export class LanguageManager {
    private static instance: LanguageManager;
    private currentLanguage: Language;

    private constructor() {
        // 获取 VSCode 语言环境
        const vscodeLanguage = vscode.env.language.toLowerCase();

        // 判断是否为中文环境
        this.currentLanguage = vscodeLanguage.startsWith('zh') ? 'zh-cn' : 'en';
        //this.currentLanguage = 'en';
    }

    /**
     * 获取单例实例
     */
    public static getInstance(): LanguageManager {
        if (!LanguageManager.instance) {
            LanguageManager.instance = new LanguageManager();
        }
        return LanguageManager.instance;
    }

    /**
     * 获取当前语言
     */
    public getCurrentLanguage(): Language {
        return this.currentLanguage;
    }

    /**
     * 获取文本
     * @param key 文本键
     * @param args 格式化参数（替换 {0}, {1}, ...）
     */
    public getText(key: TextKey, ...args: any[]): string {
        let text = TEXT_MAP[this.currentLanguage][key] || key;

        // 替换占位符 {0}, {1}, ...
        args.forEach((arg, index) => {
            text = text.replace(`{${index}}`, String(arg));
        });

        return text;
    }

    /**
     * 简写方法：快速获取文本
     */
    public t(key: TextKey, ...args: any[]): string {
        return this.getText(key, ...args);
    }

    /**
     * 获取所有 webview 相关的文本（用于传递给前端）
     */
    public getWebViewTexts(): Record<string, string> {
        const texts: Record<string, string> = {};
        const allKeys = Object.keys(TEXT_MAP[this.currentLanguage]) as TextKey[];

        // 只提取 webview 相关的文本
        allKeys.forEach(key => {
            if (key.startsWith('webview.')) {
                // 移除 webview. 前缀作为键
                const shortKey = key.replace('webview.', '');
                texts[shortKey] = TEXT_MAP[this.currentLanguage][key];
            }
        });

        return texts;
    }
}

/**
 * 导出单例实例
 */
export const lang = LanguageManager.getInstance();
