---
name: "speckit-converge"
description: "根据功能的 spec、plan 和 tasks 评估当前代码库，并将尚未完成的工作追加为 tasks.md 中的新任务，以便 implement 完成。"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/converge.md"
---


## 用户输入

```text
$ARGUMENTS
```

继续之前，你**必须**先考虑用户输入（如果输入不为空）。

## 执行前检查

**检查扩展 hook（收敛前）**：

- 检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果存在，读取它，并查找 `hooks.before_converge` 下的条目。
- 如果 YAML 无法解析或内容无效，静默跳过 hook 检查并正常继续。
- 过滤掉 `enabled` 明确为 `false` 的 hook。没有 `enabled` 字段的 hook 默认视为启用。
- 对剩余 hook，**不要**尝试解释或求值 hook 的 `condition` 表达式：
  - 如果 hook 没有 `condition` 字段，或该字段为 null/空值，则视为可执行。
  - 如果 hook 定义了非空 `condition`，跳过该 hook，把条件求值留给 HookExecutor 实现处理。
- 从 hook 命令名构造 slash command 时，将点号 (`.`) 替换为连字符 (`-`)。例如：`speckit.git.commit` → `/speckit-git-commit`。
- 对每个可执行 hook，根据它的 `optional` 标记输出以下内容：
  - **可选 hook**（`optional: true`）：

    ```text
    ## 扩展 Hook

    **可选前置 Hook**： {extension}
    命令： `/{command}`
    描述： {description}

    提示： {prompt}
    执行方式： `/{command}`
    ```

  - **强制 hook**（`optional: false`）：

    ```text
    ## 扩展 Hook

    **自动前置 Hook**： {extension}
    正在执行： `/{command}`
    EXECUTE_COMMAND: {command}

    等待 hook 命令完成后，再继续执行目标。
    ```
    输出上述区块后，你**必须**实际调用该 hook，并等待它完成后才能继续。调用方式应与你在当前 agent/session 中自行运行命令时一致（实际调用形式可能不同于上面展示的 `{command}` 字面 id，例如 skills 模式 agent 可能使用 `/skill:speckit-...` 或 `$speckit-...`）。只输出区块并不等于已经运行 hook。

- 如果没有注册 hook，或 `.specify/extensions.yml` 不存在，则静默跳过。

## 目标

弥合功能规格、计划和任务所要求内容与代码库当前实现之间的差距。将 `spec.md`、`plan.md` 和 `tasks.md` 视为**唯一意图来源**（宪章作为治理约束），评估当前代码状态，判断哪些需求、验收标准、计划决策和既有任务尚未满足、未完成或仅部分满足，并将每一块剩余工作**作为新的、可追踪任务追加**到 `tasks.md` 底部，以便 `/speckit-implement` 完成。本命令**必须**只在当前 `tasks.md` 已运行过 `/speckit-implement`，且 `/speckit-tasks` 已生成完整 `tasks.md` 后运行。

这**不是** diff 工具，也**不**跟踪变更。它只评估代码当前状态与功能产物之间的关系：不看 git、不比较分支、不读取历史。

## 操作约束

**仅追加，绝不重写**：本命令的**唯一**写入行为，是向 `tasks.md` 追加新的 `## 阶段 N：收敛` 章节。它**绝不能**：

- 以任何方式修改 `spec.md` 或 `plan.md`；
- 重写、重编号、重排或删除任何既有任务（包括先前“收敛”阶段中的任务）；
- 修改、创建或删除任何应用代码；完成追加任务是 `/speckit-implement` 的职责。

当代码库已经满足所有内容时，本命令**必须**让 `tasks.md` 保持**逐字节不变**（不添加空的“收敛”标题），并报告干净结果。

**宪章权威性**：项目宪章（`.specify/memory/constitution.md`）**不可协商**。违反 MUST 原则的代码是最高严重级别发现，并会生成对应修复任务。如果宪章仍是未填充模板，则优雅跳过宪章检查，而不是失败。

## 执行步骤

### 1. 初始化收敛上下文

从仓库根目录运行一次 `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`，并解析 JSON 中的 `FEATURE_DIR` 和 `AVAILABLE_DOCS`。推导绝对路径：

- SPEC = FEATURE_DIR/spec.md
- PLAN = FEATURE_DIR/plan.md
- TASKS = FEATURE_DIR/tasks.md
- CONSTITUTION = `.specify/memory/constitution.md`（如存在）

如果 `spec.md`、`plan.md` 或 `tasks.md` 缺失，停止并给出清晰、可执行的信息，指出应运行的前置命令（缺少 spec 时运行 `/speckit-specify`，缺少 plan 时运行 `/speckit-plan`，缺少 tasks 时运行 `/speckit-tasks`）。不要生成部分输出。
如果参数中包含单引号，例如 `"I'm Groot"`，使用转义语法：`'I'\''m Groot'`（如果可行，也可以使用双引号：`"I'm Groot"`）。

### 2. 加载产物（渐进披露）

只从每个产物加载最小必要上下文：

**来自 spec.md：**

- 功能需求（FR-###）
- 成功标准（SC-###）：只包含需要可构建工作的条目；排除发布后结果指标和业务 KPI
- 用户故事及其验收场景
- 边界情况（如存在）

**来自 plan.md：**

- 架构/技术栈选择和技术决策
- 数据模型引用
- 阶段和命名触点（计划声明将创建或编辑的文件/组件）
- 技术约束

**来自 tasks.md：**

- 任务 ID（用于计算下一个 ID 和下一个阶段号）
- 描述、阶段分组和引用的文件路径

**来自宪章（如果不是未填充模板）：**

- 原则名称和 MUST/SHOULD 规范性陈述

### 3. 构建意图清单

创建内部模型（不要回显原始产物）：

- **需求清单**：为每个 FR-### / SC-### / 用户故事验收场景（例如 `US1/AC2`）建立一个稳定 key，并加入会产生可构建义务的计划决策和宪章原则。
- **代码范围映射**：从 `plan.md` 和 `tasks.md` 中命名的文件路径，加上对每个需求概念的关键词搜索，推导出评估范围内的源文件和组件集合。评估范围只限于这些内容；**不要**推断超出产物定义的范围。

### 4. 评估代码库并分类发现

对意图清单中的每一项，检查范围内当前代码，只在存在缺口时生成 `Finding`。按**缺口类型**分类每个发现：

- **`missing`**：所需工作在代码中完全不存在。
- **`partial`**：工作存在，但尚未完全满足需求/验收标准/计划决策。
- **`contradicts`**：代码行为与既定意图或宪章 MUST 原则冲突。
- **`unrequested`**：代码包含 spec、plan 或 tasks 未要求的工作（仅提示关注；converge **不会**删除代码，只会追加任务要求审查/说明或移除它）。

每个 `Finding` 记录：稳定 id、可追踪的 `source-ref`、`gap-type`、严重级别，以及包含证据（观察到的文件/区域）的简短人类可读描述。

**边界情况：**

- **几乎没有代码或没有代码**：将整个指定范围视为 `missing` 的剩余工作，而不是失败。
- **没有剩余工作**：生成零发现，并执行步骤 7 的 converged 分支。

### 5. 分配严重级别

- **CRITICAL**：违反宪章 MUST 原则，或 `missing`/`contradicts` 缺口阻塞 P1 用户故事的基础功能。
- **HIGH**：核心功能需求或验收标准存在 `missing` 或 `partial` 缺口。
- **MEDIUM**：次要需求上的 `partial` 缺口，或理由不明的 `unrequested` 新增内容。
- **LOW**：轻微部分缺口、润色项或低风险 `unrequested` 新增内容。

### 6. 展示会话内发现摘要

追加任何内容之前，先输出紧凑、按严重级别分层的摘要（此时不写文件）：

## 收敛发现

| ID | 缺口类型 | 严重级别 | 来源 | 证据 | 剩余工作 |
|----|----------|----------|------|------|----------|
| F1 | missing  | HIGH     | FR-008 | 示例：写入 tasks.md 时，path/to/module.py 中未检测到仅追加保护 | 添加仅追加保护 |

**摘要指标：**

- 已检查的需求/验收标准
- 已检查的计划决策
- 已检查的宪章原则（或 "skipped - template"）
- 按缺口类型统计发现（missing / partial / contradicts / unrequested）
- 按严重级别统计发现

### 7. 追加收敛任务（或报告已收敛）

**如果存在一个或多个可执行发现**（`tasks_appended` 结果）：

根据追加契约，追加到 `tasks.md` 的**末尾**：

1. 扫描所有既有任务 ID；令 `M` 为最大值。确定下一个阶段号 `N`（最高既有阶段 + 1）。
2. 写入单个新章节标题 `## 阶段 N：收敛`。
3. 每个可执行发现输出一个检查表条目，优先 CRITICAL/HIGH，分配补零 ID `T{M+1:03d}, T{M+2:03d}, ...`：

   ```markdown
   - [ ] T042 <imperative description> per <source-ref> (<gap-type>)
   ```

   `<source-ref>` 将任务追踪到其来源，例如 `FR-003`、`SC-002`、`US1/AC2`、`plan: storage decision`、`Constitution II`。

   `<gap-type>` 是 `missing`、`partial`、`contradicts`、`unrequested` 之一。

   宪章违规任务**必须**最先输出，并描述为 `CRITICAL`。
4. 绝不复用或重编号既有 ID。如果先前已存在“收敛”阶段，在其下方追加一个新的、独立编号的阶段；不要触碰旧阶段。

**如果没有可执行发现**（`converged` 结果）：

- 完全**不要**修改 `tasks.md`，也不要添加空阶段标题。
- 报告：**“已收敛：实现满足 spec、plan 和 tasks。”**
- 包含已检查内容的摘要计数。

### 8. 提供后续动作（交接）

- 对 `tasks_appended`：说明在第几个阶段追加了多少任务，并建议运行 `/speckit-implement` 完成它们；说明后续再次运行 converge 应会发现更少或没有剩余项。
- 对 `converged`：建议进入评审 / 打开 PR。该功能指定范围内不再需要额外实现轮次。

### 9. 检查扩展 hook

产出结果后，检查项目根目录下是否存在 `.specify/extensions.yml`。

- 如果存在，读取它，并查找 `hooks.after_converge` 下的条目。
- 如果 YAML 无法解析或内容无效，静默跳过 hook 检查并正常继续。
- 过滤掉 `enabled` 明确为 `false` 的 hook。没有 `enabled` 字段的 hook 默认视为启用。
- 对剩余 hook，**不要**尝试解释或求值 hook 的 `condition` 表达式：
  - 如果 hook 没有 `condition` 字段，或该字段为 null/空值，则视为可执行。
  - 如果 hook 定义了非空 `condition`，跳过该 hook，把条件求值留给 HookExecutor 实现处理。
- 列出任何 hook 之前，先在会话内报告收敛结果（`converged` 或 `tasks_appended`），这样用户可以决定是否运行可选后续命令。
- 从 hook 命令名构造 slash command 时，将点号 (`.`) 替换为连字符 (`-`)。例如：`speckit.git.commit` → `/speckit-git-commit`。
- 对每个可执行 hook，根据它的 `optional` 标记输出以下内容：
  - **可选 hook**（`optional: true`）：

    ```text
    ## 扩展 Hook

    **可选 Hook**： {extension}
    命令： `/{command}`
    描述： {description}

    提示： {prompt}
    执行方式： `/{command}`
    ```

  - **强制 hook**（`optional: false`）：

    ```text
    ## 扩展 Hook

    **自动 Hook**： {extension}
    正在执行： `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    输出上述区块后，你**必须**实际调用该 hook，并等待它完成后才能继续。调用方式应与你在当前 agent/session 中自行运行命令时一致（实际调用形式可能不同于上面展示的 `{command}` 字面 id，例如 skills 模式 agent 可能使用 `/skill:speckit-...` 或 `$speckit-...`）。只输出区块并不等于已经运行 hook。

- 如果没有注册 hook，或 `.specify/extensions.yml` 不存在，则静默跳过。
