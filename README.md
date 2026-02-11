# C# API Console

轻量、直观的 C# Web API 调试工具
A lightweight and intuitive API debugging console for C# developers

🚀 **快速测试和调试 ASP.NET Core API 端点**  
A VS Code extension for quickly testing C# Web API endpoints directly from your code editor.

---

## ✨ 功能特性 | Features

### 🎯 核心能力 | Core Capabilities

- 🚀 **CodeLens 集成**：在 C# Controller 的 Action 方法上显示 "⚡ Test Endpoint" 按钮  
  **CodeLens integration**: Shows "⚡ Test Endpoint" button on Controller Action methods

- 🎯 **自动检测端点**：自动识别 HTTP Method（GET/POST/PUT/DELETE）和路由路径  
  **Auto-detection**: Automatically detects HTTP methods and route paths

- 🔐 **认证支持**：支持 Bearer Token 认证  
  **Authentication**: Bearer Token authentication support

- 📝 **参数识别**：自动识别 Query、Body、Header 和 Path 参数  
  **Parameter detection**: Automatically identifies Query, Body, Header, and Path parameters

- 📊 **响应显示**：显示 HTTP 状态码、响应头和格式化的 JSON 响应  
  **Response display**: Shows status code, headers, and formatted JSON response

- ⚡ **快速测试**：一键发送请求，实时查看结果  
  **Quick testing**: Send requests with one click and see results instantly

---

## 🎨 UI 特性 | UI Highlights

- 🧭 **CodeLens 按钮**：直接在代码中显示测试按钮，无需切换视图  
  **CodeLens button**: Test buttons appear directly in your code

- 🧾 **清晰的测试面板**：分标签页管理认证、请求头、查询参数和请求体  
  **Clean test panel**: Organized tabs for auth, headers, query params, and body

- 🛠️ **自动填充**：根据代码自动填充路由路径和参数  
  **Auto-fill**: Automatically fills route paths and parameters from your code

---

## 📷 截图 | Screenshots

![功能截图](https://gitee.com/dankit/csharp-api-console/raw/master/resources/image.png)

---

## 🧪 使用方法 | Usage

### 快速开始 | Getting Started

1. 打开包含 C# Controller 的文件  
   Open a file containing a C# Controller

2. 在 Action 方法上方会显示 "⚡ Test Endpoint" 按钮  
   The "⚡ Test Endpoint" button will appear above Action methods

3. 点击按钮打开测试面板  
   Click the button to open the test panel

4. 填写必要的参数（Token、Headers、Query、Body）  
   Fill in necessary parameters (Token, Headers, Query, Body)

5. 点击 "Send" 发送请求  
   Click "Send" to make the request

6. 查看响应结果  
   View the response

### 测试面板 | Test Panel

测试面板包含以下标签页：  
The test panel includes the following tabs:

- **Auth**: Bearer Token 认证  
  Bearer Token authentication

- **Headers**: 自定义 HTTP 头  
  Custom HTTP headers

- **Query**: URL 查询参数  
  URL query parameters

- **Body**: JSON 请求体（POST/PUT 请求）  
  JSON request body (for POST/PUT requests)

---

## 📦 安装 | Installation

1. 从 VS Code 扩展市场搜索 "C# API Console"  
   Search for "C# API Console" in the VS Code Extensions Marketplace

2. 点击安装  
   Click Install

3. 重新加载 VS Code  
   Reload VS Code