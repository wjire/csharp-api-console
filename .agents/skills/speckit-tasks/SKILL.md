---
name: "speckit-tasks"
description: "基于现有设计产物，为功能生成可执行且按依赖排序的 tasks.md。"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/tasks.md"
---


## 用户输入

```text
$ARGUMENTS
```

继续之前，你**必须**先考虑用户输入（如果输入不为空）。

## 执行前检查

**检查扩展 hook（任务生成前）**：
- 检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果存在，读取它，并查找 `hooks.before_tasks` 下的条目。
- 如果 YAML 无法解析或内容无效，静默跳过 hook 检查并正常继续。
- 过滤掉 `enabled` 明确为 `false` 的 hook。没有 `enabled` 字段的 hook 默认视为启用。
- 对剩余 hook，**不要**尝试解释或求值 hook 的 `condition` 表达式：
  - 如果 hook 没有 `condition` 字段，或该字段为 null/空值，则视为可执行。
  - 如果 hook 定义了非空 `condition`，跳过该 hook，把条件求值留给 HookExecutor 实现处理。
- 从 hook 命令名构造 slash command 时，将点号 (`.`) 替换为连字符 (`-`)。例如：`speckit.git.commit` → `/speckit-git-commit`。
- 对每个可执行 hook，根据它的 `optional` 标记输出以下内容：
  - **可选 hook**（`optional: true`）：
    ```
    ## 扩展 Hook

    **可选前置 Hook**： {extension}
    命令： `/{command}`
    描述： {description}

    提示： {prompt}
    执行方式： `/{command}`
    ```
  - **强制 hook**（`optional: false`）：
    ```
    ## 扩展 Hook

    **自动前置 Hook**： {extension}
    正在执行： `/{command}`
    EXECUTE_COMMAND: {command}

    等待 hook 命令完成后，再继续执行大纲。
    ```
    输出上述区块后，你**必须**实际调用该 hook，并等待它完成后才能继续。调用方式应与你在当前 agent/session 中自行运行命令时一致（实际调用形式可能不同于上面展示的 `{command}` 字面 id，例如 skills 模式 agent 可能使用 `/skill:speckit-...` 或 `$speckit-...`）。只输出区块并不等于已经运行 hook。
- 如果没有注册 hook，或 `.specify/extensions.yml` 不存在，则静默跳过。

## 执行大纲

1. **准备**：从仓库根目录运行 `.specify/scripts/powershell/setup-tasks.ps1 -Json`，并解析 `FEATURE_DIR`、`TASKS_TEMPLATE` 和 `AVAILABLE_DOCS` 列表。提供时，`FEATURE_DIR` 和 `TASKS_TEMPLATE` 必须是绝对路径。`AVAILABLE_DOCS` 是 `FEATURE_DIR` 下可用文档名称/相对路径列表（例如 `research.md` 或 `contracts/`）。如果参数中包含单引号，例如 `"I'm Groot"`，使用转义语法：`'I'\''m Groot'`（如果可行，也可以使用双引号：`"I'm Groot"`）。

2. **加载设计文档**：从 `FEATURE_DIR` 读取：
   - **必需**：`plan.md`（技术栈、库、结构）、`spec.md`（带优先级的用户故事）
   - **可选**：`data-model.md`（实体）、`contracts/`（接口契约）、`research.md`（决策）、`quickstart.md`（测试场景）
   - **如果存在**：加载 `.specify/memory/constitution.md`，读取项目原则和治理约束
   - 说明：不是所有项目都会有所有文档。根据实际可用内容生成任务。

3. **执行任务生成流程**：
   - 加载 `plan.md`，提取技术栈、库和项目结构。
   - 加载 `spec.md`，提取用户故事及其优先级（P1、P2、P3 等）。
   - 如果存在 `data-model.md`：提取实体并映射到用户故事。
   - 如果存在 `contracts/`：将接口契约映射到用户故事。
   - 如果存在 `research.md`：提取决策，形成准备任务。
   - 生成按用户故事组织的任务（见下方“任务生成规则”）。
   - 生成依赖图，展示用户故事完成顺序。
   - 为每个用户故事创建并行执行示例。
   - 校验任务完整性（每个用户故事都有必要任务，且可独立测试）。

4. **生成 tasks.md**：读取 JSON 输出中的 `TASKS_TEMPLATE` 作为结构。如果 `TASKS_TEMPLATE` 为空，回退到 `.specify/templates/tasks-template.md`。填充：
   - 来自 `plan.md` 的正确功能名称。
   - 阶段 1：准备任务（项目初始化）。
   - 阶段 2：基础任务（阻塞所有用户故事的前置条件）。
   - 阶段 3+：每个用户故事一个阶段（按 `spec.md` 优先级排序）。
   - 每个阶段包含：故事目标、独立测试标准、测试（如要求）、实现任务。
   - 最终阶段：润色和横切关注点。
   - 所有任务必须遵循严格检查表格式（见下方“任务生成规则”）。
   - 每个任务都必须有清晰文件路径。
   - 依赖章节展示故事完成顺序。
   - 每个故事都有并行执行示例。
   - 实现策略章节（先 MVP、增量交付）。

## 强制执行后 Hook

**在向用户报告完成之前，你必须完成本章节。**

检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果不存在，或没有在 `hooks.after_tasks` 下注册 hook，跳到“完成报告”。
- 如果存在，读取它，并查找 `hooks.after_tasks` 下的条目。
- 如果 YAML 无法解析或内容无效，静默跳过 hook 检查并进入完成报告。
- 过滤掉 `enabled` 明确为 `false` 的 hook。没有 `enabled` 字段的 hook 默认视为启用。
- 对剩余 hook，**不要**尝试解释或求值 hook 的 `condition` 表达式：
  - 如果 hook 没有 `condition` 字段，或该字段为 null/空值，则视为可执行。
  - 如果 hook 定义了非空 `condition`，跳过该 hook，把条件求值留给 HookExecutor 实现处理。
- 从 hook 命令名构造 slash command 时，将点号 (`.`) 替换为连字符 (`-`)。例如：`speckit.git.commit` → `/speckit-git-commit`。
- 对每个可执行 hook，根据它的 `optional` 标记输出以下内容：
  - **强制 hook**（`optional: false`）— **你必须为每个强制 hook 输出 `EXECUTE_COMMAND:`**：
    ```
    ## 扩展 Hook

    **自动 Hook**： {extension}
    正在执行： `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    输出上述区块后，你**必须**实际调用该 hook，并等待它完成后才能继续。调用方式应与你在当前 agent/session 中自行运行命令时一致（实际调用形式可能不同于上面展示的 `{command}` 字面 id，例如 skills 模式 agent 可能使用 `/skill:speckit-...` 或 `$speckit-...`）。只输出区块并不等于已经运行 hook。
  - **可选 hook**（`optional: true`）：
    ```
    ## 扩展 Hook

    **可选 Hook**： {extension}
    命令： `/{command}`
    描述： {description}

    提示： {prompt}
    执行方式： `/{command}`
    ```

## 完成报告

输出生成的 `tasks.md` 路径和摘要：
- 任务总数
- 每个用户故事的任务数量
- 已识别的并行机会
- 每个故事的独立测试标准
- 建议 MVP 范围（通常只包含用户故事 1）
- 格式校验：确认所有任务都遵循检查表格式（checkbox、ID、标签、文件路径）

任务生成上下文：$ARGUMENTS

`tasks.md` 应该可以立即执行。每个任务都必须足够具体，让 LLM 无需额外上下文也能完成。

## 任务生成规则

**关键**：任务必须按用户故事组织，以支持独立实现和测试。

**测试是可选的**：只有在功能规格中明确要求测试，或用户要求 TDD 方法时，才生成测试任务。

### 检查表格式（必需）

每个任务都必须严格遵循以下格式：

```text
- [ ] [TaskID] [P?] [Story?] 带文件路径的任务描述
```

**格式组成**：

1. **复选框**：始终以 `- [ ]` 开头（Markdown checkbox）
2. **任务 ID**：按执行顺序连续编号（T001、T002、T003...）
3. **[P] 标记**：仅当任务可并行时包含（不同文件，且不依赖未完成任务）
4. **[Story] 标签**：仅用户故事阶段任务必需
   - 格式：[US1]、[US2]、[US3] 等（映射到 spec.md 中的用户故事）
   - 准备阶段：不加 story 标签
   - 基础阶段：不加 story 标签
   - 用户故事阶段：必须加 story 标签
   - 润色阶段：不加 story 标签
5. **描述**：清晰动作 + 精确文件路径

**示例**：

- 正确：`- [ ] T001 按实现计划创建项目结构`
- 正确：`- [ ] T005 [P] 在 src/middleware/auth.py 实现认证中间件`
- 正确：`- [ ] T012 [P] [US1] 在 src/models/user.py 创建 User 模型`
- 正确：`- [ ] T014 [US1] 在 src/services/user_service.py 实现 UserService`
- 错误：`- [ ] 创建 User 模型`（缺少 ID 和 Story 标签）
- 错误：`T001 [US1] 创建模型`（缺少 checkbox）
- 错误：`- [ ] [US1] 创建 User 模型`（缺少 Task ID）
- 错误：`- [ ] T001 [US1] 创建模型`（缺少文件路径）

### 任务组织

1. **来自用户故事（spec.md）** - 主要组织方式：
   - 每个用户故事（P1、P2、P3...）都有自己的阶段。
   - 将所有相关组件映射到对应故事：
     - 该故事需要的模型
     - 该故事需要的服务
     - 该故事需要的接口/UI
     - 如果要求测试：该故事专属测试
   - 标记故事依赖（大多数故事应保持独立）。

2. **来自契约**：
   - 将每个接口契约映射到它服务的用户故事。
   - 如果要求测试：每个接口契约在该故事阶段的实现前生成一个 [P] 契约测试任务。

3. **来自数据模型**：
   - 将每个实体映射到需要它的用户故事。
   - 如果实体服务多个故事：放入最早的相关故事或准备阶段。
   - 关系 -> 对应故事阶段中的服务层任务。

4. **来自准备/基础设施**：
   - 共享基础设施 -> 准备阶段（阶段 1）。
   - 基础/阻塞任务 -> 基础阶段（阶段 2）。
   - 故事专属准备 -> 放入该故事阶段。

### 阶段结构

- **阶段 1**：准备（项目初始化）
- **阶段 2**：基础能力（阻塞性前置条件，必须在用户故事前完成）
- **阶段 3+**：按优先级排序的用户故事（P1、P2、P3...）
  - 每个故事内部：测试（如要求）-> 模型 -> 服务 -> 端点 -> 集成
  - 每个阶段都应是完整、可独立测试的增量
- **最终阶段**：润色与横切关注点

## 完成条件

- [ ] 已生成包含所有阶段、任务 ID 和文件路径的 `tasks.md`。
- [ ] 扩展 hook 已按“强制执行后 Hook”规则执行或跳过。
- [ ] 已向用户报告任务数量、故事拆分和 MVP 范围。
