# C# API Console

> ⚡ **轻量、直观的 ASP.NET Core API 调试工具**  
> A lightweight and intuitive API debugging console for C# developers

在代码中一键测试 API 端点，无需离开编辑器，无需切换工具！  
Test API endpoints with one click directly in your code editor - no tool switching needed!

[![Version](https://img.shields.io/visual-studio-marketplace/v/dankit.csharp-api-console)](https://marketplace.visualstudio.com/items?itemName=dankit.csharp-api-console)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/dankit.csharp-api-console)](https://marketplace.visualstudio.com/items?itemName=dankit.csharp-api-console)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/dankit.csharp-api-console)](https://marketplace.visualstudio.com/items?itemName=dankit.csharp-api-console)

---

## 📦 仓库地址 | Repository

- **GitHub**: https://github.com/wjire/csharp-api-console
- **Gitee (国内镜像)**: https://gitee.com/dankit/csharp-api-console

---

## 📷 预览 | Preview

![功能截图](https://raw.githubusercontent.com/wjire/csharp-api-console/master/resources/codeLens.png)

![功能截图](https://raw.githubusercontent.com/wjire/csharp-api-console/master/resources/consolePanel.png)

![功能截图](https://raw.githubusercontent.com/wjire/csharp-api-console/master/resources/baseUrlSelect.png)

![功能截图](https://raw.githubusercontent.com/wjire/csharp-api-console/master/resources/baseUrlManage.png)

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

### 🛠️ **Base URL 管理** | Base URL Management

- 点击请求区域右侧的 **⚙️ 配置按钮**打开 Base URL 管理面板  
  Click the **⚙️ Config button** on the right side of request area to open Base URL management panel

- 支持添加、编辑、删除自定义 Base URL，方便在多个环境间切换  
  Support adding, editing, and deleting custom Base URLs for easy environment switching

- 所有自定义 Base URL 保存在项目的 `.vscode/csharp-api-console-config.json` 文件中  
  All custom Base URLs are saved in `.vscode/csharp-api-console-config.json` in your project

- 自动缓存配置，读写性能优化，支持多项目独立配置  
  Auto-cached configuration with optimized read/write performance, supports independent config per project

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

## 💡 Base URL 管理说明 | Base URL Management Guide

### 如何管理 Base URL | How to Manage Base URLs

1. **打开管理面板**  
   点击测试面板中请求区域右侧的 **⚙️ 配置按钮**  
   Click the **⚙️ Config button** on the right side of the request area in the test panel

2. **添加新 Base URL**  
   点击 **"+ Add New Base URL"** 按钮，输入完整的 URL（如 `https://api.example.com`）  
   Click **"+ Add New Base URL"** button and enter the complete URL (e.g., `https://api.example.com`)

3. **编辑 Base URL**  
   直接在输入框中修改 URL 内容  
   Edit the URL directly in the input field

4. **删除 Base URL**  
   点击 URL 旁边的 **🗑️ 删除按钮**  
   Click the **🗑️ Delete button** next to the URL

5. **保存更改**  
   点击 **✓ 保存按钮**保存所有更改  
   Click the **✓ Save button** to save all changes

### 配置文件位置 | Configuration File Location

所有自定义的 Base URL 存储在：  
All custom Base URLs are stored in:

```
<项目根目录>/.vscode/csharp-api-console-config.json
<Project Root>/.vscode/csharp-api-console-config.json
```

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

**提示 | Tips**:
- 可以直接编辑此文件来批量管理 Base URL  
  You can edit this file directly to manage Base URLs in batch
- 建议将此文件加入 `.gitignore`，避免将私人配置提交到版本控制  
  Consider adding this file to `.gitignore` to avoid committing personal configs
- 每个项目都有独立的配置，互不影响  
  Each project has its own independent configuration

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

- **报告问题** | Report Issues: [GitHub Issues](https://github.com/wjire/csharp-api-console/issues)
- **功能建议** | Feature Requests: [GitHub Issues](https://github.com/wjire/csharp-api-console/issues)
- **源代码** | Source Code: [GitHub Repository](https://github.com/wjire/csharp-api-console)
- **国内镜像** | China Mirror: [Gitee Repository](https://gitee.com/dankit/csharp-api-console)

---

## 📝 许可证 | License

[MIT License](LICENSE)

---

## 🎉 享受编码！ | Happy Coding!

如果这个扩展对你有帮助，请给我们一个 ⭐ Star！  
If you find this extension helpful, please give us a ⭐ Star!