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

        // WebView - 标签页
        'webview.tab.headers': 'Headers',
        'webview.tab.auth': 'Auth',
        'webview.tab.query': 'Query',
        'webview.tab.body': 'Body',
        'webview.tab.response': 'Response',

        // WebView - 输入框
        'webview.placeholder.baseUrl': '选择 Base URL',
        'webview.placeholder.route': '/api/route',
        'webview.placeholder.token': 'token（Bearer 前缀可选）',
        'webview.placeholder.body': '在此输入 JSON body...',
        'webview.placeholder.key': 'Key',
        'webview.placeholder.value': 'Value',
        'webview.placeholder.parameter': 'parameter',
        'webview.placeholder.baseUrlInput': 'https://api.example.com',

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

        // WebView - Tabs
        'webview.tab.headers': 'Headers',
        'webview.tab.auth': 'Auth',
        'webview.tab.query': 'Query',
        'webview.tab.body': 'Body',
        'webview.tab.response': 'Response',

        // WebView - Placeholders
        'webview.placeholder.baseUrl': 'Select Base URL',
        'webview.placeholder.route': '/api/route',
        'webview.placeholder.token': 'token (Bearer prefix optional)',
        'webview.placeholder.body': 'Enter JSON body here...',
        'webview.placeholder.key': 'Key',
        'webview.placeholder.value': 'Value',
        'webview.placeholder.parameter': 'parameter',
        'webview.placeholder.baseUrlInput': 'https://api.example.com',

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
