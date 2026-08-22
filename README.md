# C# API Console

> ⚡ **轻量、直观的 ASP.NET Core API 测试与一键调试工具**
> A lightweight and intuitive ASP.NET Core API testing and one-click debugging tool

在代码中一键测试 API 并快速启动调试，无需离开编辑器，无需切换工具！
Test APIs and start debugging with one click directly in your code editor - no tool switching needed!

[![Version](https://img.shields.io/visual-studio-marketplace/v/dankit.csharp-api-console)](https://marketplace.visualstudio.com/items?itemName=dankit.csharp-api-console)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/dankit.csharp-api-console)](https://marketplace.visualstudio.com/items?itemName=dankit.csharp-api-console)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/dankit.csharp-api-console)](https://marketplace.visualstudio.com/items?itemName=dankit.csharp-api-console)

---

## 📷 预览 | Preview

![功能截图](https://raw.githubusercontent.com/wjire/csharp-api-console/master/resources/codeLens.png)

![功能截图](https://raw.githubusercontent.com/wjire/csharp-api-console/master/resources/json.png)

![功能截图](https://raw.githubusercontent.com/wjire/csharp-api-console/master/resources/formData.png)

![功能截图](https://raw.githubusercontent.com/wjire/csharp-api-console/master/resources/binary.png)

---

## ✨ 核心特性 | Key Features

### 🎯 **CodeLens 集成** | CodeLens Integration

- 在每个 Controller Action 方法上自动显示测试按钮
  Automatically shows a test button above each Controller action method

- 精确定位到方法名位置，与"引用"按钮并列显示
  Precisely positioned at the method name and displayed alongside the "References" button

- 支持同时打开多个测试标签页
  Supports opening multiple test tabs simultaneously

- 智能识别基元类型 Query 入参：点击 CodeLens 自动切换到 Query 标签并预填参数键名
  Smart primitive Query parameter detection: clicking CodeLens automatically switches to the Query tab and pre-fills parameter keys

- 智能识别 Body 入参类型：`IFormFile` 自动切换到 Binary，`[FromForm]` 自动切换到 FormData
  Smart Body parameter-type detection: `IFormFile` auto-switches to Binary, and `[FromForm]` auto-switches to FormData

### ⚡ **智能路由解析** | Smart Route Resolution

- 自动识别 `[HttpGet]`, `[HttpPost]`, `[HttpPut]`, `[HttpDelete]` 等特性
  Automatically detects HTTP method attributes

- 解析 `[Route]` 特性，支持控制器和方法级路由
  Parses `[Route]` attributes at both controller and action levels

- 智能处理 `[controller]`, `[action]` 占位符
  Handles `[controller]` and `[action]` placeholders intelligently

- 支持路由参数占位符（如 `order/{id}`）：发送请求时自动替换为用户输入值
  Supports route parameter placeholders (e.g. `order/{id}`): automatically replaces them with user-provided values when sending requests

- 支持 `[ApiVersion]` 特性和自定义默认版本
  Supports the `[ApiVersion]` attribute with a configurable default version

### 🐞 **一键启动调试** | One-click Debug Start

- 在请求栏中提供 **启动调试** 按钮（位于 Send 左侧），可在发送 API 请求前快速启动当前项目调试
  A **Start Debug** button is available in the request bar (left of Send) to quickly start debugging before sending API requests

- 启动调试时自动遵循项目 `launchSettings.json` 配置（包括环境变量）
  Debug start follows project `launchSettings.json` configuration (including environment variables)

- 支持多项目并行调试：仅阻止同项目重复启动，不影响其他项目调试
  Supports multi-project concurrent debugging: only blocks duplicate starts for the same project

- 调试状态自动同步：通过工具栏停止、命令面板停止或 `Shift+F5` 结束会话后，按钮状态会自动恢复
  Debug status syncs automatically: when a session ends via toolbar stop, command palette stop, or `Shift+F5`, button state resets automatically

- 按目标框架自动选择调试器：`net5.0+` 默认使用 `dotnet`，`netcoreapp` 等旧框架自动回退 `coreclr`，兼容旧项目调试
  Automatically selects debugger by target framework: uses `dotnet` for `net5.0+`, and falls back to `coreclr` for older frameworks such as `netcoreapp` for better legacy compatibility

- `coreclr` 启动调试前会先自动执行 Debug 构建（按目标框架）；若构建失败会取消启动并提示，若构建后仍缺失 DLL 则显示缺失程序集路径
  Before `coreclr` debug launch, the extension automatically runs a Debug build first (by target framework); if build fails, launch is canceled with a friendly message, and if DLL is still missing after build, the missing assembly path is shown

### 🔗 **自动配置 Base URL** | Auto Base URL Configuration

- 自动读取项目的 `launchSettings.json` 文件
  Automatically reads the project's `launchSettings.json` file

- 智能解析 `applicationUrl` 和 `launchUrl`，自动构建完整的 API URL
  Intelligently parses `applicationUrl` and `launchUrl` to build complete API URLs

- 实时监听文件变化，配置更新后自动刷新
  Watches files in real time and refreshes automatically when configuration changes

- 无需手动输入 Base URL，开箱即用
  No manual Base URL input required; works out of the box

### 🛠️ **Base URL 管理** | Base URL Management

- 支持添加、编辑、删除自定义 Base URL，方便在多个环境间切换
  Supports adding, editing, and deleting custom Base URLs for easy environment switching

- 所有自定义 Base URL 均基于项目，同一项目的不同 API 无需重复设置
  Base URL settings are project-scoped and shared across APIs in the same project.

### 🧪 **Swagger Mock 一键生成** | One-click Swagger Mock

- 在 Body/Auth/Headers/Query 这一行右侧提供统一 `Mock` 按钮，一次生成并填充可用的 Query / Body / FormData 测试数据
  A unified `Mock` button is available on the Body/Auth/Headers/Query tab row to generate and fill Query / Body / FormData test data in one action

- `Mock` 旁提供“同步 Swagger”按钮；检测到项目已有缓存时显示为“更新 Swagger”，点击后从当前 Base URL 获取最新文档并覆盖缓存
  A `Sync Swagger` button is available next to `Mock`; it changes to `Update Swagger` when a project cache exists and refreshes the cache from the current Base URL when clicked

- Mock 使用“单消息单返回”链路，避免并发双请求导致的状态错乱
  Mock uses a single-request single-response flow to avoid state conflicts caused by concurrent dual requests

- 严格按 Swagger `requestBody.content` 媒体类型生成：`application/json` 只填 JSON，`multipart/form-data` 只填 FormData
  Mock generation strictly follows Swagger `requestBody.content` media type: `application/json` only fills JSON, `multipart/form-data` only fills FormData

- 若 Query 中已存在同名 Key，则保留用户当前 Value，不会被 Mock 覆盖（便于调试保留手工值）
  If a Query key already exists, the current user value is preserved and will not be overwritten by Mock (useful for debugging with manual values)

- Swagger 文档会按项目持久化缓存到项目根目录的 `.vscode/` 下，默认文件名形如 `csharp-api-console-swagger-cache-*.json`
  Swagger documents are persisted per project under the project's `.vscode/` folder, with a file name like `csharp-api-console-swagger-cache-*.json`

- Mock 仅使用本地缓存，不会自动请求 Swagger；没有缓存时会提示“同步 Swagger”，缓存无法生成数据时会提示“更新 Swagger”
  Mock only uses the local cache and never fetches Swagger automatically; it prompts `Sync Swagger` when no cache exists and `Update Swagger` when the cache cannot generate data

## ⚙️ 配置 | Configuration

在 VS Code 设置中搜索 `C# API Console`:
Search for `C# API Console` in VS Code settings:

### `csharpApiConsole.codeLensDebounceDelay`

- **Default**: `300`
  CodeLens 扫描防抖延迟（毫秒）。设置为 0 禁用防抖。
  CodeLens scanning debounce delay in milliseconds. Set to 0 to disable.

### `csharpApiConsole.codeLensCacheTtlSeconds`

- **Default**: `120`
- **Range**: `0 - 3600`
  CodeLens 缓存过期时间（秒），自上次访问起超过该时长将失效。设置为 0 表示不启用 TTL。
  CodeLens cache TTL in seconds. Entries expire after this duration since last access. Set to 0 to disable TTL.

### `csharpApiConsole.codeLensCacheMaxEntries`

- **Default**: `100`
- **Range**: `1 - 200`
  CodeLens 缓存最大条目数（按文档/控制器文件计，不是按单个 CodeLens 按钮计），超过后优先淘汰最近最少使用（LRU）的条目。
  Maximum CodeLens cache entries (counted per document/controller file, not per individual CodeLens item). When exceeded, least recently used (LRU) entries are evicted first.

### `csharpApiConsole.defaultApiVersion`

- **Default**: `"1.0"`
  控制器无 `[ApiVersion]` 特性时的默认版本。留空则不替换占位符。
  Default API version when controller has no `[ApiVersion]` attribute. Leave empty to keep placeholder.

### `csharpApiConsole.requestTimeoutSeconds`

- **Default**: `0`
  HTTP 请求超时时间（秒），设置为 `<= 0` 表示不设置超时。
  HTTP request timeout in seconds. Set `<= 0` to disable timeout.

### `csharpApiConsole.swaggerJsonPaths`

- **Default**: `"/swagger/v1/swagger.json"`
  Mock 生成时在当前 Base URL 下使用的 Swagger/OpenAPI JSON 相对路径。
  Relative Swagger/OpenAPI JSON path used under the current Base URL for Mock generation.

### `csharpApiConsole.swaggerAuthUsername`

- **Default**: `"admin"`
  请求 Swagger/OpenAPI JSON 时使用的用户名（可选）。
  Optional username used when requesting Swagger/OpenAPI JSON.

### `csharpApiConsole.swaggerAuthPassword`

- **Default**: `"123456"`
  请求 Swagger/OpenAPI JSON 时使用的密码（可选）。
  Optional password used when requesting Swagger/OpenAPI JSON.

### `csharpApiConsole.largeResponseThresholdKb`

- **Default**: `1024`
  大响应降级渲染阈值（KB）。超过该值将使用纯文本降级渲染。
  Large response rendering threshold in KB. Responses above this value use plain-text fallback rendering.

### `csharpApiConsole.maxResponseLineNumbers`

- **Default**: `2000`
  UI 中最多渲染的响应行号数量。
  Maximum response line numbers rendered in the UI.

### `csharpApiConsole.jsonIndentSpaces`

- **Default**: `2`
- **Options**: `2` / `4`
  请求格式化与响应美化时使用的 JSON 缩进空格数。
  JSON indentation spaces used in request formatting and response pretty-printing.

---

## 💡 Base URL 管理说明 | Base URL Management Guide

**配置文件位置 | Configuration File Location**

```
<Project Root>/.vscode/csharp-api-console-config.json
```

**Swagger 缓存文件位置 | Swagger Cache File Location**

```text
<Project Root>/.vscode/csharp-api-console-swagger-cache-*.json
```

说明：缓存是按项目隔离的，不按 Swagger 地址分 key。“同步 Swagger”成功后会写入缓存，后续 Mock 优先使用该缓存；也可点击“更新 Swagger”主动获取最新文档。
Note: the cache is isolated per project and does not use Swagger URL as the key. A successful `Sync Swagger` writes the cache, subsequent Mock requests prefer it, and `Update Swagger` can be used to fetch the latest document explicitly.

**示例文件内容 | Example file content**:

```json
{
  "baseUrls": {
    "E:\\MyProject\\MyApi.csproj": [
      "https://api-dev.example.com",
      "https://api-staging.example.com",
      "https://api-prod.example.com"
    ]
  }
}
```

---

## 🚀 路线图 | Roadmap

### 计划中的功能 | Planned Features

- [ ] **更多鉴权方式**：补全 Basic / OAuth2 等鉴权能力
- [ ] **More Auth Types**: Add support for Basic / OAuth2 and more auth workflows

---

## 📦 安装 | Installation

1. 打开 VS Code 扩展面板 (`Ctrl+Shift+X` / `Cmd+Shift+X`)
   Open VS Code Extensions panel

2. 搜索 "**C# API Console**"
   Search for "C# API Console"

3. 点击 **Install**
   Click Install

4. 打开任意 C# Controller 文件即可使用
   Open any C# Controller file to start testing

---

## 📦 仓库地址 | Repository

- **GitHub**: https://github.com/wjire/csharp-api-console
- **Gitee**: https://gitee.com/dankit/csharp-api-console

---

## 📝 许可证 | License

[MIT License](LICENSE)

---

## 🎉 享受编码！ | Happy Coding!

如果这个扩展对你有帮助，请给我们一个 ⭐ Star！
If you find this extension helpful, please give us a ⭐ Star!
