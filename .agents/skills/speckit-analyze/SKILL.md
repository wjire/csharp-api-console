---
name: "speckit-analyze"
description: "在任务生成后，对 spec.md、plan.md 和 tasks.md 执行非破坏性的跨产物一致性与质量分析。"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/analyze.md"
---


## 用户输入

```text
$ARGUMENTS
```

继续之前，你**必须**先考虑用户输入（如果输入不为空）。

## 执行前检查

**检查扩展 hook（分析前）**：
- 检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果存在，读取它，并查找 `hooks.before_analyze` 下的条目。
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

    等待 hook 命令完成后，再继续执行目标。
    ```
    输出上述区块后，你**必须**实际调用该 hook，并等待它完成后才能继续。调用方式应与你在当前 agent/session 中自行运行命令时一致（实际调用形式可能不同于上面展示的 `{command}` 字面 id，例如 skills 模式 agent 可能使用 `/skill:speckit-...` 或 `$speckit-...`）。只输出区块并不等于已经运行 hook。
- 如果没有注册 hook，或 `.specify/extensions.yml` 不存在，则静默跳过。

## 目标

在实现前，识别三个核心产物（`spec.md`、`plan.md`、`tasks.md`）之间的不一致、重复、歧义和欠定义项。本命令**必须**只在 `/speckit-tasks` 成功生成完整 `tasks.md` 后运行。

## 操作约束

**严格只读**：不要修改任何文件。输出结构化分析报告。可以提供可选修复计划，但后续任何编辑命令都必须由用户明确批准后才可手动调用。

**宪章权威性**：项目宪章（`.specify/memory/constitution.md`）在本分析范围内**不可协商**。宪章冲突自动视为 CRITICAL，必须调整 spec、plan 或 tasks，而不是削弱、重新解释或静默忽略原则。如果原则本身需要变更，必须在 `/speckit-analyze` 之外通过单独且明确的宪章更新完成。

## 执行步骤

### 1. 初始化分析上下文

从仓库根目录运行一次 `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`，并解析 JSON 中的 `FEATURE_DIR` 和 `AVAILABLE_DOCS`。推导绝对路径：

- SPEC = FEATURE_DIR/spec.md
- PLAN = FEATURE_DIR/plan.md
- TASKS = FEATURE_DIR/tasks.md

如果任何必需文件缺失，输出错误信息并中止（指示用户运行缺失的前置命令）。
如果参数中包含单引号，例如 `"I'm Groot"`，使用转义语法：`'I'\''m Groot'`（如果可行，也可以使用双引号：`"I'm Groot"`）。

### 2. 加载产物（渐进披露）

只从每个产物中加载最小必要上下文：

**来自 spec.md：**

- 概览/上下文
- 功能需求
- 成功标准（可衡量结果，例如性能、安全、可用性、用户成功、业务影响）
- 用户故事
- 边界情况（如存在）

**来自 plan.md：**

- 架构/技术栈选择
- 数据模型引用
- 阶段
- 技术约束

**来自 tasks.md：**

- 任务 ID
- 描述
- 阶段分组
- 并行标记 `[P]`
- 引用的文件路径

**来自宪章：**

- 加载 `.specify/memory/constitution.md` 进行原则校验

### 3. 构建语义模型

创建内部表示（不要在输出中包含原始产物）：

- **需求清单**：对每个功能需求（FR-###）和成功标准（SC-###）记录稳定 key。存在显式 FR-/SC- 标识时，将其作为主 key；可选地派生一个祈使短语 slug 以便可读（例如“用户可以上传文件”-> `user-can-upload-file`）。只包含需要可构建工作的成功标准（例如负载测试基础设施、安全审计工具），排除发布后结果指标和业务 KPI（例如“支持工单减少 50%”）。
- **用户故事/动作清单**：带验收标准的离散用户动作。
- **任务覆盖映射**：将每个任务映射到一个或多个需求/故事（通过关键词或 ID/关键短语等显式引用模式推断）。
- **宪章规则集**：提取原则名称和 MUST/SHOULD 规范性陈述。

### 4. 检测过程（token 高效分析）

聚焦高信号发现。最多输出 50 条发现；其余内容汇总到 overflow summary。

#### A. 重复检测

- 识别近似重复需求。
- 标记质量较低、需要合并的表述。

#### B. 歧义检测

- 标记缺少可衡量标准的模糊形容词（如“快速”“可扩展”“安全”“直观”“健壮”）。
- 标记未解决占位符（TODO、TKTK、???、`<placeholder>` 等）。

#### C. 欠定义

- 含动词但缺少对象或可衡量结果的需求。
- 缺少验收标准对齐的用户故事。
- 引用 spec/plan 中未定义文件或组件的任务。

#### D. 宪章对齐

- 任何与 MUST 原则冲突的需求或计划元素。
- 缺失宪章强制要求的章节或质量门禁。

#### E. 覆盖缺口

- 没有关联任务的需求。
- 没有映射到需求/故事的任务。
- 需要可构建工作的成功标准（性能、安全、可用性）未反映在任务中。

#### F. 不一致

- 术语漂移（同一概念在不同文件中使用不同名称）。
- plan 中引用但 spec 中缺失的数据实体，或反之。
- 任务顺序矛盾（例如集成任务早于基础设置任务，且没有依赖说明）。
- 冲突需求（例如一个要求 Next.js，另一个指定 Vue）。

### 5. 严重级别分配

使用以下启发式确定优先级：

- **CRITICAL**：违反宪章 MUST、缺失核心规格产物，或阻塞基础功能的需求零覆盖。
- **HIGH**：重复或冲突需求、模糊的安全/性能属性、不可测试的验收标准。
- **MEDIUM**：术语漂移、非功能任务覆盖缺失、边界情况欠定义。
- **LOW**：风格/措辞改进、不影响执行顺序的轻微冗余。

### 6. 生成紧凑分析报告

输出 Markdown 报告（不写入文件），结构如下：

## 规格分析报告

| ID | 类别 | 严重级别 | 位置 | 摘要 | 建议 |
|----|------|----------|------|------|------|
| A1 | 重复 | HIGH | spec.md:L120-134 | 两条需求高度相似 ... | 合并表述，保留更清晰版本 |

（每条发现一行；生成以类别首字母为前缀的稳定 ID。）

**覆盖摘要表：**

| 需求 Key | 是否有任务 | 任务 ID | 备注 |
|----------|------------|---------|------|

**宪章对齐问题：**（如有）

**未映射任务：**（如有）

**指标：**

- 需求总数
- 任务总数
- 覆盖率 %（至少有 1 个任务的需求占比）
- 歧义数量
- 重复数量
- 严重问题数量

### 7. 提供后续动作

在报告末尾输出简洁的“后续动作”区块：

- 如果存在 CRITICAL 问题：建议先解决，再运行 `/speckit-implement`。
- 如果只有 LOW/MEDIUM：用户可以继续，但提供改进建议。
- 提供明确命令建议，例如：“运行 /speckit-specify 细化规格”、“运行 /speckit-plan 调整架构”、“手动编辑 tasks.md，为 'performance-metrics' 增加覆盖任务”。

### 8. 提供修复建议选项

询问用户：“是否需要我为前 N 个问题给出具体修复建议？”（不要自动应用。）

### 9. 检查扩展 hook

报告完成后，检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果存在，读取它，并查找 `hooks.after_analyze` 下的条目。
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

    **可选 Hook**： {extension}
    命令： `/{command}`
    描述： {description}

    提示： {prompt}
    执行方式： `/{command}`
    ```
  - **强制 hook**（`optional: false`）：
    ```
    ## 扩展 Hook

    **自动 Hook**： {extension}
    正在执行： `/{command}`
    EXECUTE_COMMAND: {command}
    ```
    输出上述区块后，你**必须**实际调用该 hook，并等待它完成后才能继续。调用方式应与你在当前 agent/session 中自行运行命令时一致（实际调用形式可能不同于上面展示的 `{command}` 字面 id，例如 skills 模式 agent 可能使用 `/skill:speckit-...` 或 `$speckit-...`）。只输出区块并不等于已经运行 hook。
- 如果没有注册 hook，或 `.specify/extensions.yml` 不存在，则静默跳过。

## 操作原则

### 上下文效率

- **最小高信号 token**：聚焦可执行发现，而不是穷尽式文档。
- **渐进披露**：增量加载产物；不要把所有内容倾倒进分析。
- **token 高效输出**：发现表最多 50 行；超出部分汇总。
- **确定性结果**：在无改动情况下重复运行，应产生一致的 ID 和计数。

### 分析指导

- **绝不修改文件**（这是只读分析）。
- **绝不臆造缺失章节**（如果缺失，如实报告）。
- **优先处理宪章违规**（它们始终是 CRITICAL）。
- **用具体例子胜过穷尽规则**（引用具体实例，而不是泛泛模式）。
- **零问题时优雅报告**（输出成功报告和覆盖统计）。

## 上下文

$ARGUMENTS
