# C# API Console

> ⚡ **轻量、直观的 ASP.NET Core API 调试工具**  
> A lightweight and intuitive API debugging console for C# developers

在代码中一键测试 API 端点，无需离开编辑器，无需切换工具！  
Test API endpoints with one click directly in your code editor - no tool switching needed!

[![Version](https://img.shields.io/visual-studio-marketplace/v/dankit.csharp-api-console)](https://marketplace.visualstudio.com/items?itemName=dankit.csharp-api-console)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/dankit.csharp-api-console)](https://marketplace.visualstudio.com/items?itemName=dankit.csharp-api-console)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/dankit.csharp-api-console)](https://marketplace.visualstudio.com/items?itemName=dankit.csharp-api-console)

---

## 📷 预览 | Preview

![功能截图](https://gitee.com/dankit/csharp-api-console/raw/master/resources/image1.png)

![功能截图](https://gitee.com/dankit/csharp-api-console/raw/master/resources/image2.png)

---

## ✨ 核心特性 | Key Features

### 🎯 **CodeLens 集成** | CodeLens Integration

- 在每个 Controller Action 方法上自动显示测试按钮  
  Auto-show test button above each Controller Action method

- 精确定位到方法名位置，与"引用"按钮并列显示  
  Precisely positioned at method name, displayed alongside "References" button

- 支持同时打开多个测试标签页  
  Support opening multiple test tabs simultaneously

### ⚡ **智能端点检测** | Smart Endpoint Detection

- 自动识别 `[HttpGet]`, `[HttpPost]`, `[HttpPut]`, `[HttpDelete]` 特性  
  Auto-detect HTTP method attributes

- 解析 `[Route]` 特性，支持控制器和方法级路由  
  Parse `[Route]` attributes at controller and method levels

- 智能处理 `[controller]`, `[action]` 占位符  
  Smart handling of `[controller]` and `[action]` placeholders

- 支持 `[ApiVersion]` 特性和自定义默认版本  
  Support `[ApiVersion]` attribute with configurable default version

### 🔗 **自动配置 Base URL** | Auto Base URL Configuration

- 自动读取项目的 `launchSettings.json` 文件  
  Auto-read project's `launchSettings.json` file

- 智能解析 `applicationUrl` 和 `launchUrl`，自动构建完整的 API 端点 URL  
  Smart parse `applicationUrl` and `launchUrl` to build complete endpoint URLs

- 实时监听文件变化，配置更新后自动刷新  
  Real-time file watching, auto-refresh when configuration changes

- 无需手动输入 Base URL，开箱即用  
  No need to manually input Base URL, works out of the box

## 🧪 使用方法 | Usage

### 快速开始 | Quick Start

1. **打开 Controller 文件**  
   Open a C# Controller file

2. **查看 CodeLens 按钮**  
   You'll see a CodeLens button above each Action method:
   ```
   ⚡ GET /api/users
   ```

3. **点击按钮打开测试面板**  
   Click the button to open the test panel

4. **配置请求**（可选）  
   Configure your request (optional):
   - **Auth**: 添加 Bearer Token | Add Bearer Token
   - **Headers**: 添加自定义请求头 | Add custom headers
   - **Query**: 设置查询参数 | Set query parameters
   - **Body**: 编辑请求体（POST/PUT） | Edit request body (for POST/PUT)

5. **发送请求并查看响应**  
   Click "Send" and view the response

### 支持的路由格式 | Supported Route Formats

```csharp
// ✅ 控制器级路由 | Controller-level route
[Route("api/[controller]")]
public class UsersController : ControllerBase

// ✅ 方法级路由 | Method-level route
[HttpGet("query")]
public IActionResult Query() { }

// ✅ 路由参数 | Route parameters
[HttpGet("{id}")]
public IActionResult GetById(int id) { }

// ✅ [action] 占位符 | [action] placeholder
[Route("api/[controller]/[action]")]
public class TestController : ControllerBase
{
    public IActionResult Test1() { }  // → /api/test/Test1
}

// ✅ API 版本 | API versioning
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/[controller]")]
public class ProductsController : ControllerBase
```

---

## ⚙️ 配置 | Configuration

在 VS Code 设置中搜索 `C# API Console`:  
Search for `C# API Console` in VS Code settings:

### `csharpApiConsole.codeLensDebounceDelay`
- **类型 | Type**: `number`
- **默认值 | Default**: `300`
- **说明 | Description**:  
  CodeLens 扫描防抖延迟（毫秒）。设置为 0 禁用防抖。  
  CodeLens scanning debounce delay in milliseconds. Set to 0 to disable.

### `csharpApiConsole.defaultApiVersion`
- **类型 | Type**: `string`
- **默认值 | Default**: `"1.0"`
- **说明 | Description**:  
  控制器无 `[ApiVersion]` 特性时的默认版本。留空则不替换占位符。  
  Default API version when controller has no `[ApiVersion]` attribute. Leave empty to keep placeholder.

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

## 🤝 反馈与支持 | Feedback & Support

- **报告问题** | Report Issues: [Gitee Issues](https://gitee.com/dankit/csharp-api-console/issues)
- **功能建议** | Feature Requests: [Gitee Issues](https://gitee.com/dankit/csharp-api-console/issues)
- **源代码** | Source Code: [Gitee Repository](https://gitee.com/dankit/csharp-api-console)

---

## 📝 许可证 | License

[MIT License](LICENSE)

---

## 🎉 享受编码！ | Happy Coding!

如果这个扩展对你有帮助，请给我们一个 ⭐ Star！  
If you find this extension helpful, please give us a ⭐ Star!