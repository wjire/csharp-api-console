# Changelog | 更新日志

记录 C# API Console 的所有重要更新。  
All notable changes to this project will be documented in this file.

---

## [1.0.0] - 2026-02-11

### 🎉 首次发布 | Initial Release

第一个正式版本，为 ASP.NET Core 开发者提供便捷的 API 测试工具。  
First stable release - a convenient API testing tool for ASP.NET Core developers.

### ✨ 核心功能 | Key Features

- **CodeLens 集成**：在 Action 方法上显示 "⚡ Test" 按钮，精确定位到方法名位置
- **智能端点检测**：自动识别 HTTP 方法、路由、参数，支持 `[controller]`、`[action]`、`[ApiVersion]` 占位符
- **自动配置 Base URL**：读取 `launchSettings.json`，自动构建完整 URL，实时监听文件变化
- **多标签测试**：同时打开多个测试面板，支持 Auth、Headers、Query、Body 配置
- **格式化响应**：显示状态码、Headers 和格式化的 JSON

### 🚀 性能优化 | Performance

- **两层缓存架构**：项目配置缓存 + CodeLens 缓存
- **防抖机制**：避免输入时频繁扫描（可配置延迟 300ms）
- **延迟加载**：仅在点击测试时加载项目配置

### ⚙️ 配置选项 | Configuration

- `csharpApiConsole.codeLensDebounceDelay` - CodeLens 扫描防抖延迟（默认 300ms）
- `csharpApiConsole.defaultApiVersion` - 默认 API 版本（默认 "1.0"）

---

## 反馈 | Feedback

如有问题或建议，欢迎访问：  
For issues or suggestions, please visit:

**Gitee**: https://gitee.com/dankit/csharp-api-console/issues