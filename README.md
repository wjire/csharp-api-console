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

![功能截图](https://raw.githubusercontent.com/wjire/csharp-api-console/master/resources/baseUrlSelect.png)

![功能截图](https://raw.githubusercontent.com/wjire/csharp-api-console/master/resources/baseUrlManage.png)

---

## ✨ 核心特性 | Key Features

### 🎯 **CodeLens 集成** | CodeLens Integration

- 在每个 Controller Action 方法上自动显示测试按钮  
  Automatically shows a test button above each Controller action method

- 精确定位到方法名位置，与"引用"按钮并列显示  
  Precisely positioned at the method name and displayed alongside the "References" button

- 支持同时打开多个测试标签页  
  Supports opening multiple test tabs simultaneously

### ⚡ **智能路由解析** | Smart Route Resolution

- 自动识别 `[HttpGet]`, `[HttpPost]`, `[HttpPut]`, `[HttpDelete]` 等特性  
  Automatically detects HTTP method attributes

- 解析 `[Route]` 特性，支持控制器和方法级路由  
  Parses `[Route]` attributes at both controller and action levels

- 智能处理 `[controller]`, `[action]` 占位符  
  Handles `[controller]` and `[action]` placeholders intelligently

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

**配置文件位置 | Configuration File Location**

```
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

---

## 🚀 路线图 | Roadmap

### 计划中的功能 | Planned Features

- [ ] **参数 Mock**：支持为 Query、Body 等参数配置 Mock 数据，快速生成测试场景
- [ ] **Parameters Mock**: Support configuring mock data for Query, Body parameters to quickly generate test scenarios

- [ ] **请求历史记录**：保存最近的请求历史，方便快速重复测试
- [ ] **Request History**: Save recent request history for quick repeated testing

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