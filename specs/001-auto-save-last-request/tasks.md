# 任务：自动保存最近一次请求记录

**输入**：来自 `/specs/001-auto-save-last-request/` 的设计文档

**前置条件**：plan.md、spec.md、research.md、data-model.md、contracts/

**测试**：规格未要求 TDD 或新增自动化测试；本任务清单使用 `npm run compile` 与 quickstart 场景进行验证。

**组织方式**：任务按用户故事分组，以便每个故事都能独立实现和测试。

## 格式：`[ID] [P?] [Story] 描述`

- **[P]**：可并行执行（不同文件、无依赖）
- **[Story]**：该任务属于哪个用户故事（例如 US1、US2、US3）
- 描述中必须包含精确文件路径

## 路径约定

- 扩展宿主代码：`src/`
- WebView 前端代码：`webview/`
- 功能设计文档：`specs/001-auto-save-last-request/`

---

## 阶段 1：准备（共享基础设施）

**目的**：建立本功能需要的共享数据结构和契约基线。

- [X] T001 在 src/services/requestHistoryStore.ts 扩展 RequestHistoryItem 类型，加入可选的 headers、bodyMode、binaryBodyBase64、binaryContentType、binaryFileName、formDataFields、response 字段并保持旧记录兼容
- [X] T002 [P] 在 src/apiConsolePanel.ts 扩展 sendHttpRequest 与 saveRequestHistory 的 requestData/response 类型声明，使其覆盖 contracts/webview-history-contract.md 中的 sendRequest 字段
- [X] T003 [P] 在 webview/api-console.js 为历史项增加兼容读取约定，确保旧记录缺少 headers、bodyMode、response 字段时仍可应用 query、body、token、statusCode

---

## 阶段 2：基础能力（阻塞性前置条件）

**目的**：完成所有用户故事都会依赖的历史保存、脱敏和响应快照基础能力。

**关键**：本阶段完成前，不得开始任何用户故事工作。

- [X] T004 在 src/apiConsolePanel.ts 实现请求 Headers 脱敏与保存辅助逻辑，并复用现有 Bearer Token 保存开关和 Query/Body 脱敏策略
- [X] T005 在 src/apiConsolePanel.ts 实现 Body 模式保存辅助逻辑，覆盖 json、formdata、binary，并对超出 requestHistoryMaxBodyKb 的内容保存降级值或元数据
- [X] T006 在 src/apiConsolePanel.ts 实现响应结果快照保存辅助逻辑，保存 success、statusCode、headers、body、duration、error、errorCode，并对超大响应体执行降级保存
- [X] T007 在 src/apiConsolePanel.ts 更新 saveRequestHistory，写入完整的测试请求输入记录和响应结果记录，同时保持 requestHistoryEnabled、requestHistoryLimit、requestHistoryTtlDays 的现有行为
- [X] T008 在 webview/api-console.js 抽取可复用的响应渲染入口，使 requestComplete 和历史恢复都能使用同一 displayResponse 渲染路径

**检查点**：历史项已能保存 Auth、Headers、Query、Body 和响应快照，WebView 具备复用渲染能力。

---

## 阶段 3：用户故事 1 - 重新打开测试面板自动恢复上次记录（优先级：P1）MVP

**目标**：用户重新打开同一接口测试面板时，自动看到最近一次请求输入和响应结果，并可直接再次发送。

**独立测试**：对某个接口填写 Auth、Headers、Query、Body 并发送，关闭后再次打开同一接口测试面板，验证请求输入和响应结果自动恢复。

### 用户故事 1 的实现

- [X] T009 [US1] 在 webview/api-console.js 扩展发送请求 payload，补充 baseUrl、headers、bodyMode、formDataFields、binaryBodyBase64、binaryContentType、binaryFileName 等历史保存所需字段
- [X] T010 [US1] 在 webview/api-console.js 扩展 applyHistoryRecord，恢复 Auth、Headers、Query、json Body、formdata Body、binary 元数据和 bodyMode
- [X] T011 [US1] 在 webview/api-console.js 收到 requestHistoryLoaded 时自动选择并应用第一条历史记录，同时将 historySelect 选中该记录
- [X] T012 [US1] 在 webview/api-console.js 应用历史记录中的 response 快照并调用共享响应渲染入口，确保打开面板时展示最近一次响应结果但不重新发送请求
- [X] T013 [US1] 在 webview/api-console.js 为历史恢复的响应结果增加可见标识，说明该响应来自最近一次已发送请求而不是本次打开面板产生的新响应
- [X] T014 [US1] 在 src/apiConsolePanel.ts 调整 loadRequestHistory 返回给 WebView 的历史项，确保未启用 requestHistorySaveBearerToken 时 token 字段为空且 response 快照仍可恢复

**检查点**：用户故事 1 完整可用，并可作为 MVP 独立验证。

---

## 阶段 4：用户故事 2 - 新接口仍保持默认预填体验（优先级：P2）

**目标**：没有历史记录的接口继续使用当前默认初始化、自动 Query 参数和推荐 Body 模式，不被历史恢复逻辑干扰。

**独立测试**：打开从未发送过请求的接口，验证不会恢复其他接口数据，现有自动预填仍正常。

### 用户故事 2 的实现

- [X] T015 [US2] 在 webview/api-console.js 为自动历史恢复增加面板初始化与用户编辑状态保护，避免用户已编辑后被后续历史加载覆盖
- [X] T016 [US2] 在 webview/api-console.js 确保 initializeWithApiEndpoint 清空旧历史展示和响应展示，但保留现有 autoQueryParamNames 与 preferredBodyMode 预填逻辑
- [X] T017 [US2] 在 webview/api-console.js 处理 requestHistoryLoaded 空列表场景，保持历史下拉为空状态并不修改当前请求输入
- [X] T018 [US2] 在 src/services/requestHistoryStore.ts 和 webview/api-console.js 增加损坏或非法历史数据兜底，确保读取失败、字段类型异常或不可应用记录会回退到无历史默认体验
- [X] T019 [US2] 在 src/apiConsolePanel.ts 确认 loadRequestHistory 在无 endpointKey、历史禁用或历史为空时只发送空数组，不发送其他上下文记录

**检查点**：没有历史记录的测试面板仍保持现有默认体验。

---

## 阶段 5：用户故事 3 - 不混淆不同调试上下文（优先级：P3）

**目标**：不同项目、Base URL 或接口之间的最近一次请求记录互不串用。

**独立测试**：在不同接口和同一接口的不同 Base URL 下分别发送请求，再分别打开或切换验证只恢复对应上下文记录。

### 用户故事 3 的实现

- [X] T020 [US3] 在 src/apiConsolePanel.ts 调整历史 endpointKey 生成逻辑，将规范化 projectPath、当前 Base URL、HTTP 方法、routeTemplate 纳入匹配键
- [X] T021 [US3] 在 src/apiConsolePanel.ts 增加 requestRequestHistory 消息处理，按 WebView 传入的 baseUrl 加载对应上下文历史
- [X] T022 [US3] 在 src/apiConsolePanel.ts 调整 clearRequestHistory，使清空操作只清理当前项目、Base URL、接口对应的历史记录
- [X] T023 [US3] 在 webview/api-console.js 的 Base URL 初始化和 change 事件中发送 requestRequestHistory，确保切换 Base URL 后重新加载对应历史
- [X] T024 [US3] 在 webview/api-console.js 确保 Base URL 切换后重置自动恢复状态，允许新 Base URL 的最近一次记录自动应用但不覆盖用户正在编辑的内容

**检查点**：项目、Base URL、接口维度的历史记录互不覆盖或串用。

---

## 阶段 6：润色与横切关注点

**目的**：验证完整功能、整理文档和减少回归风险。

- [ ] T025 [P] 在 specs/001-auto-save-last-request/quickstart.md 执行并记录场景 1 到场景 6 的验证结果
- [X] T026 在 package.json 所在项目根目录运行 npm run compile，并修复 src/ 或 webview/ 中由本功能引入的类型或语法错误
- [X] T027 [P] 在 CHANGELOG.md 增加 1.1.3 中文和英文条目，说明测试面板会自动恢复最近一次请求输入和响应结果
- [X] T028 在 webview/api-console.js 检查历史恢复后的响应区域、Headers 标签、历史下拉和发送按钮状态，修复影响 quickstart 验证的 UI 状态不一致问题

---

## 依赖与执行顺序

### 阶段依赖

- **准备（阶段 1）**：无依赖，可立即开始
- **基础能力（阶段 2）**：依赖准备阶段完成，会阻塞所有用户故事
- **用户故事 1（阶段 3）**：依赖基础能力完成，是建议 MVP
- **用户故事 2（阶段 4）**：依赖基础能力完成，可在 US1 后验证默认体验，也可与 US1 之后的 WebView 工作串行完成
- **用户故事 3（阶段 5）**：依赖基础能力完成，涉及上下文键和 Base URL 历史加载，建议在 US1 可用后推进
- **润色（阶段 6）**：依赖目标用户故事完成

### 用户故事依赖

- **用户故事 1（P1）**：基础能力完成后即可开始，不依赖其他故事
- **用户故事 2（P2）**：基础能力完成后即可开始，但需要与 US1 的自动恢复逻辑保持一致
- **用户故事 3（P3）**：基础能力完成后即可开始，但建议在 US1 的保存/恢复链路稳定后调整上下文隔离

### 每个用户故事内部

- 先扩展扩展宿主保存/加载能力，再调整 WebView 应用逻辑
- 先保证旧历史兼容，再保存和恢复新字段
- 一个故事完成后按 quickstart 对应场景独立验证

### 并行机会

- T002 与 T003 可并行
- T025 与 T027 可在实现完成后并行
- 基础能力完成后，US2 的空历史保护任务可与 US3 的 Base URL 隔离任务分工推进，但同一文件 `webview/api-console.js` 的编辑需要协调

---

## 并行示例：用户故事 1

```bash
# WebView 侧恢复链路：
任务："T010 [US1] 在 webview/api-console.js 扩展 applyHistoryRecord，恢复 Auth、Headers、Query、json Body、formdata Body、binary 元数据和 bodyMode"

# 扩展宿主侧返回链路：
任务："T014 [US1] 在 src/apiConsolePanel.ts 调整 loadRequestHistory 返回给 WebView 的历史项，确保未启用 requestHistorySaveBearerToken 时 token 字段为空且 response 快照仍可恢复"
```

---

## 实现策略

### 先做 MVP（仅用户故事 1）

1. 完成阶段 1：准备
2. 完成阶段 2：基础能力
3. 完成阶段 3：用户故事 1
4. 使用 quickstart 场景 1 和场景 2 验证
5. 停止并确认 MVP 行为

### 增量交付

1. 完成准备 + 基础能力 -> 可保存完整历史项
2. 添加用户故事 1 -> 自动恢复最近一次请求输入和响应结果
3. 添加用户故事 2 -> 保证无历史记录时默认体验不回退
4. 添加用户故事 3 -> 增加项目、Base URL、接口隔离
5. 运行 compile 和 quickstart 全场景验证

### 并行团队策略

多人协作时：

1. 团队共同完成阶段 1 和阶段 2
2. 基础能力完成后：
   - 开发者 A：用户故事 1 的 WebView 自动恢复
   - 开发者 B：用户故事 2 的空历史与编辑保护
   - 开发者 C：用户故事 3 的 Base URL 上下文隔离
3. 最后统一处理 `webview/api-console.js` 冲突并运行 quickstart 验证

---

## 备注

- [P] 任务 = 不同文件、无依赖
- [Story] 标签用于把任务映射到具体用户故事，便于追踪
- 每个用户故事都应能独立完成和测试
- 实现前应优先保护旧历史记录兼容性
- 避免打开测试面板时重新发送请求
- 避免用历史记录覆盖当前接口的 HTTP 方法、路由和接口元信息

---

## 阶段 7：收敛

- [X] T029 修复 Bearer Auth 自动保存与恢复链路，确保发送后重新打开同一项目 + Base URL + 接口时 Auth > Bearer 输入框显示最近一次发送的 Token per FR-002 (partial)
