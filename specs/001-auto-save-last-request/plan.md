# 实现计划：自动保存最近一次请求记录

**分支**：`001-auto-save-last-request` | **日期**：2026-07-06 | **规格**：[spec.md](./spec.md)

**输入**：来自 `specs/001-auto-save-last-request/spec.md` 的功能规格

**说明**：本模板由 `/speckit-plan` 命令填充。执行流程见 `.specify/templates/plan-template.md`。

## 摘要

在现有“按接口请求历史”能力上扩展最近一次记录的保存与自动恢复。根据更新后的规格，请求输入恢复范围聚焦用户在测试面板中填写或调整的 Auth、Headers、Query、Body；项目、Base URL、接口、方法和路由作为调试上下文，用于定位和隔离最近一次记录，避免不同环境或接口串用。

实现方向是复用 `RequestHistoryStore` 的 `workspaceState` 存储、TTL、数量限制、请求体大小限制和 Bearer Token 保存策略，扩展历史项以保存 Headers、Body 模式与响应结果，并在 WebView 加载匹配历史后自动应用最新一条记录。核心变化集中在 `src/services/requestHistoryStore.ts`、`src/apiConsolePanel.ts` 与 `webview/api-console.js`。

## 技术上下文

**语言/版本**：TypeScript 5.3，目标输出 ES2020，运行于 VS Code 扩展宿主。

**主要依赖**：VS Code Extension API、Node.js 20 类型定义、项目现有 `HttpClient`、`RequestHistoryStore`、WebView 静态 HTML/CSS/JS。

**存储**：不采用 VS Code `ExtensionContext.workspaceState`；参考 Bearer Token 与历史请求记录的持久化方式，使用工作区 `.vscode/csharp-api-console-config.json` 中的现有存储结构，新增字段采用可选字段以兼容旧历史项。

**测试**：`npm run compile` 作为类型与构建校验；必要时通过 VS Code Extension Host 手动验证 WebView 场景。仓库当前没有独立单元测试目录。

**目标平台**：VS Code `^1.85.0`，面向 C# / ASP.NET Core API 调试工作流。

**项目类型**：VS Code 扩展，包含扩展宿主 TypeScript 代码与 WebView 前端脚本。

**性能目标**：打开测试面板后 3 秒内展示最近一次请求输入和响应结果；历史记录加载不引入用户可感知延迟。

**约束**：不扩大敏感信息保存范围；保持 `requestHistoryEnabled`、`requestHistoryLimit`、`requestHistoryTtlDays`、`requestHistorySaveBearerToken`、`requestHistoryMaxBodyKb` 的现有语义；大内容按现有上限降级保存；不在打开面板时自动重新发送请求。

**规模/范围**：单个 VS Code 扩展内的面板状态恢复功能；覆盖同一项目、Base URL、接口下最近一次请求输入和响应结果恢复。

## 宪章检查

*门禁：必须在阶段 0 研究前通过。阶段 1 设计后需重新检查。*

当前 `.specify/memory/constitution.md` 仍为占位模板，没有定义可执行的项目原则、质量门禁或治理规则。因此本计划没有可评估的宪章违规项。

阶段 0 前检查：通过。没有发现已定义门禁。

阶段 1 后检查：通过。设计保持增量修改，不引入新依赖或跨项目结构变化。

## 项目结构

### 文档（本功能）

```text
specs/001-auto-save-last-request/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── webview-history-contract.md
└── tasks.md
```

### 源代码（仓库根目录）

```text
src/
├── apiConsolePanel.ts                 # 面板生命周期、请求发送、历史加载与保存
├── services/
│   ├── requestHistoryStore.ts         # 请求历史数据结构、读取、写入、TTL 裁剪
│   └── httpClient.ts                  # 请求执行与响应结果来源
├── models/
│   └── apiEndpoint.ts                 # 接口上下文来源
└── languageManager.ts                 # 如需补充恢复提示文案则在此维护

webview/
├── api-console.html                   # 历史下拉、请求输入、响应展示 DOM
├── api-console.js                     # 自动恢复、历史应用、响应渲染
└── api-console.css                    # 如需状态提示样式则在此维护

package.json                           # 编译脚本与相关配置项
```

**结构决策**：采用现有单扩展结构，扩展已有请求历史模块和 WebView 消息流；不新增后端服务、不新增数据库、不拆分新包。

## 复杂度跟踪

没有需要说明的宪章违规项。
