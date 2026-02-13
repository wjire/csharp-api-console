# Changelog | 更新日志

记录 C# API Console 的所有重要更新。  
All notable changes to this project will be documented in this file.

---

## [1.0.4] - 2026-02-13

### ⚡ 性能优化 | Performance Improvements

- **CodeLens 位置优化**：确保 API 测试 CodeLens 始终显示在官方"引用" CodeLens 右侧，避免位置错乱
- **CodeLens Position Optimization**: Ensure API testing CodeLens always appears to the right of the official "References" CodeLens to avoid display order issues

---

## [1.0.3] - 2026-02-13

### 🎨 界面优化 | UI Improvements

- **布局重构**：顶部集中显示请求控件（HTTP 方法 + Base URL + Route + 操作按钮），下方左右分栏（请求参数 / 响应区域）
- **Layout Refactoring**: Top bar with request controls (HTTP method + Base URL + Route + action buttons), bottom split view (request params / response area)

### 🔧 功能改进 | Feature Improvements

- **launchSettings.json 注释支持**：自动过滤 `//` 开头的注释行，避免 JSON 解析错误
- **launchSettings.json Comment Support**: Automatically filter comment lines starting with `//` to prevent JSON parsing errors

- **模态框交互优化**：Base URL 管理模态框只能通过按钮关闭，避免误操作导致未保存内容丢失
- **Modal Interaction Optimization**: Base URL management modal can only be closed via buttons to prevent accidental loss of unsaved changes

### ⚡ 性能优化 | Performance Improvements

- **资源清理改进**：优化 HttpClient 资源释放逻辑，确保面板关闭时正确清理
- **Resource Cleanup Improvement**: Optimized HttpClient resource disposal logic to ensure proper cleanup when panel is closed

---

## [1.0.2] - 2026-02-12

### ✨ 新功能 | New Features

- **Base URL 管理**：新增 Base URL 管理功能，支持添加、编辑、删除自定义 Base URL
- **Base URL Management**: Added Base URL management feature with support for adding, editing, and deleting custom Base URLs

- **环境切换**：可以快速在开发、测试、生产等多个环境之间切换
- **Environment Switching**: Quick switching between development, staging, production and other environments

- **配置持久化**：Base URL 配置保存在 `.vscode/csharp-api-console-config.json` 文件中，每个项目独立配置
- **Persistent Configuration**: Base URL configs are saved in `.vscode/csharp-api-console-config.json`, independent per project

### 🎨 界面优化 | UI Improvements

- **请求状态反馈**：点击 Send 按钮后自动置灰，防止重复提交
- **Request status feedback**: Send button is automatically disabled after clicking to prevent duplicate submissions

- **加载状态提示**：发送请求时显示"正在发送中..."提示，响应完成后恢复
- **Loading state indicator**: Display "Sending..." message while request is in progress, restore after completion

- **紧凑布局**：优化按钮和输入框布局，所有元素高度统一，无缝连接
- **Compact Layout**: Optimized button and input layout, all elements unified in height with seamless connection

---

## [1.0.1] - 2026-02-12

### 🐛 Bug 修复 | Bug Fixes

- **修复可空类型解析**：支持 `Task<long?>`, `Task<Person?>` 等可空泛型返回类型的方法识别
- **Fixed nullable type parsing**: Support method detection with nullable generic return types like `Task<long?>`, `Task<Person?>`

---

## [1.0.0] - 2026-02-11

### 🎉 首次发布 | Initial Release

第一个正式版本，为 ASP.NET Core 开发者提供便捷的 API 测试工具。  
First stable release - a convenient API testing tool for ASP.NET Core developers.

### ✨ 核心功能 | Key Features

- **CodeLens 集成**：在 Action 方法上显示 "⚡ Test" 按钮，精确定位到方法名位置
- **CodeLens Integration**: Display "⚡ Test" button above Action methods, precisely positioned at method name

- **智能端点检测**：自动识别 HTTP 方法、路由、参数，支持 `[controller]`、`[action]`、`[ApiVersion]` 占位符
- **Smart Endpoint Detection**: Auto-detect HTTP methods, routes, parameters, support `[controller]`, `[action]`, `[ApiVersion]` placeholders

- **自动配置 Base URL**：读取 `launchSettings.json`，自动构建完整 URL，实时监听文件变化
- **Auto Base URL Configuration**: Read `launchSettings.json`, auto-build complete URLs, real-time file watching

- **多标签测试**：同时打开多个测试面板，支持 Auth、Headers、Query、Body 配置
- **Multi-tab Testing**: Open multiple test panels simultaneously, support Auth, Headers, Query, Body configuration

- **格式化响应**：显示状态码、Headers 和格式化的 JSON
- **Formatted Response**: Display status code, Headers and formatted JSON

### 🚀 性能优化 | Performance

- **两层缓存架构**：项目配置缓存 + CodeLens 缓存
- **Two-layer Cache Architecture**: Project config cache + CodeLens cache

- **防抖机制**：避免输入时频繁扫描（可配置延迟 300ms）
- **Debounce Mechanism**: Avoid frequent scanning on input (configurable delay 300ms)

- **延迟加载**：仅在点击测试时加载项目配置
- **Lazy Loading**: Load project configuration only when clicking test button

### ⚙️ 配置选项 | Configuration

- `csharpApiConsole.codeLensDebounceDelay` - CodeLens 扫描防抖延迟（默认 300ms）
- `csharpApiConsole.codeLensDebounceDelay` - CodeLens scanning debounce delay (default 300ms)

- `csharpApiConsole.defaultApiVersion` - 默认 API 版本（默认 "1.0"）
- `csharpApiConsole.defaultApiVersion` - Default API version (default "1.0")

---

## 反馈 | Feedback

如有问题或建议，欢迎访问：  
For issues or suggestions, please visit:

**Gitee**: https://gitee.com/dankit/csharp-api-console/issues