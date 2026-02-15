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
        'webview.debug.start': '启动调试',
        'webview.debug.starting': '启动中...',
        'webview.debug.running': '调试中',
        'webview.debug.started': '调试已启动',
        'webview.debug.alreadyRunning': '调试会话已在运行',
        'webview.debug.failed': '启动调试失败',
        'webview.debug.noProject': '缺少项目路径，无法启动调试',

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
        'webview.bodyMode.formatJson': '格式化',
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
        'webview.placeholder.queryString': '粘贴查询字符串（如 ?id=1&name=dankit，? 可选）。优先使用这里的参数，如果为空则使用下面添加的参数',

        // WebView - 状态栏
        'webview.status.label': '状态:',
        'webview.size.label': '大小:',
        'webview.time.label': '耗时:',
        'webview.status.sending': '正在发送...',

        // WebView - Base URL 管理
        'webview.baseUrl.manage': '管理 Base URLs',
        'webview.baseUrl.add': '+ 添加 Base URL',
        'webview.baseUrl.empty': '暂无 Base URL，点击"+ 添加 Base URL"添加一个',
        'webview.baseUrl.saved': 'Base URLs 已保存',
        'webview.history.placeholder': '历史记录',
        'webview.history.clear': '清空',
        'webview.history.cleared': '该接口历史记录已清空',

        // WebView - Auth
        'webview.auth.bearer': 'Bearer',
        'webview.auth.basic': 'Basic',
        'webview.auth.oauth2': 'OAuth 2',

        // WebView - 错误信息
        'webview.error.requestFailed': '请求失败',
        'webview.error.invalidJson': 'JSON 格式错误',
        'webview.error.networkError': '网络错误',
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
        'webview.debug.start': 'Start Debug',
        'webview.debug.starting': 'Starting...',
        'webview.debug.running': 'Debug Running',
        'webview.debug.started': 'Debug session started',
        'webview.debug.alreadyRunning': 'Debug session is already running',
        'webview.debug.failed': 'Failed to start debugging',
        'webview.debug.noProject': 'Missing project path, cannot start debugging',

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
        'webview.bodyMode.formatJson': 'Format',
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
        'webview.placeholder.queryString': 'Paste query string (e.g., ?id=1&name=dankit, ? optional). Parameters here take priority, fallback to manual list if empty',

        // WebView - Status Bar
        'webview.status.label': 'Status:',
        'webview.size.label': 'Size:',
        'webview.time.label': 'Time:',
        'webview.status.sending': 'Sending...',

        // WebView - Base URL Management
        'webview.baseUrl.manage': 'Manage Base URLs',
        'webview.baseUrl.add': '+ Add Base URL',
        'webview.baseUrl.empty': 'No Base URLs yet. Click "+ Add Base URL" to add one.',
        'webview.baseUrl.saved': 'Base URLs saved',
        'webview.history.placeholder': 'Request History',
        'webview.history.clear': 'Clear',
        'webview.history.cleared': 'Endpoint history cleared',

        // WebView - Auth
        'webview.auth.bearer': 'Bearer',
        'webview.auth.basic': 'Basic',
        'webview.auth.oauth2': 'OAuth 2',

        // WebView - Error Messages
        'webview.error.requestFailed': 'Request failed',
        'webview.error.invalidJson': 'Invalid JSON format',
        'webview.error.networkError': 'Network error',
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
        // this.currentLanguage = 'en';
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
