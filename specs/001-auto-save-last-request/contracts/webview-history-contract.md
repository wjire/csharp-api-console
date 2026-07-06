# WebView 历史恢复契约

本契约描述扩展宿主与 `webview/api-console.js` 之间为最近一次请求恢复新增或扩展的消息结构。

## WebView -> Extension：发送请求

消息类型：`sendRequest`

用途：用户点击 Send 后，WebView 将请求输入发送给扩展宿主。该消息同时作为保存最近一次请求输入和响应结果的数据来源。

```ts
{
  type: 'sendRequest',
  data: {
    method: string;
    url: string;
    baseUrl?: string;
    path?: string;
    query?: string;
    headers: Record<string, string>;
    token?: string;
    body?: string;
    bodyMode?: 'json' | 'formdata' | 'binary';
    binaryBodyBase64?: string;
    binaryContentType?: string;
    binaryFileName?: string;
    formDataFields?: Array<{
      key: string;
      type: 'text' | 'file';
      value?: string;
      valueBase64?: string;
      fileName?: string;
      contentType?: string;
      enabled?: boolean;
    }>;
  };
}
```

说明：

- `method`、`url`、`baseUrl`、`path` 用于定位调试上下文和实际发送请求。
- 自动恢复时的用户输入范围为 `token`、`headers`、`query`、`bodyMode`、`body`、`formDataFields`、Binary 相关字段。

## WebView -> Extension：请求指定 Base URL 的历史

消息类型：`requestRequestHistory`

用途：Base URL 下拉初始化或切换后，WebView 请求当前项目、接口、Base URL 范围内的历史记录。

```ts
{
  type: 'requestRequestHistory',
  data: {
    baseUrl: string;
  };
}
```

## Extension -> WebView：历史记录加载完成

消息类型：`requestHistoryLoaded`

用途：扩展宿主返回当前调试上下文下的历史记录。列表按 `timestamp` 倒序排列，WebView 可自动应用第一条作为最近一次记录。

```ts
{
  type: 'requestHistoryLoaded',
  data: Array<{
    id: string;
    timestamp: number;
    query: string;
    body: string;
    token?: string;
    statusCode: number | null;
    headers?: Record<string, string>;
    bodyMode?: 'json' | 'formdata' | 'binary';
    binaryBodyBase64?: string;
    binaryContentType?: string;
    binaryFileName?: string;
    formDataFields?: Array<{
      key: string;
      type: 'text' | 'file';
      value?: string;
      valueBase64?: string;
      fileName?: string;
      contentType?: string;
      enabled?: boolean;
    }>;
    response?: {
      success: boolean;
      statusCode?: number;
      headers?: Record<string, string | string[] | undefined>;
      body?: string;
      duration?: number;
      error?: string;
      errorCode?: string;
    };
  }>;
}
```

## WebView 行为要求

- 收到 `requestHistoryLoaded` 后，如果列表非空且当前面板尚未被用户编辑，自动应用第一条记录。
- 自动应用历史记录时，应恢复 Auth、Headers、Query、Body 模式、Body 内容和响应结果。
- 自动应用历史记录时，不应覆盖当前面板从接口分析得到的 HTTP 方法、路由和接口元信息。
- 用户手动选择历史下拉时，继续应用所选记录。
- 用户编辑恢复出的内容不会向扩展宿主写入历史；只有 `sendRequest` 完成后才更新历史。
- 如果记录缺少新字段，WebView 必须兼容旧历史项，只恢复已有的 `query`、`body`、`token`、`statusCode`。
