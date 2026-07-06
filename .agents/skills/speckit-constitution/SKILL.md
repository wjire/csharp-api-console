---
name: "speckit-constitution"
description: "根据交互输入或已提供的原则创建/更新项目宪章，并确保所有依赖模板保持同步。"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/constitution.md"
---


## 用户输入

```text
$ARGUMENTS
```

继续之前，你**必须**先考虑用户输入（如果输入不为空）。

## 执行前检查

**检查扩展 hook（宪章更新前）**：
- 检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果存在，读取它，并查找 `hooks.before_constitution` 下的条目。
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

你正在更新 `.specify/memory/constitution.md` 中的项目宪章。该文件是一个模板，包含方括号包裹的占位 token（例如 `[PROJECT_NAME]`、`[PRINCIPLE_1_NAME]`）。你的任务是：(a) 收集/推导具体值，(b) 精确填充模板，(c) 将所有修订传播到依赖产物。

**说明**：如果 `.specify/memory/constitution.md` 尚不存在，它应已在项目设置阶段由 `.specify/templates/constitution-template.md` 初始化。如果缺失，先复制该模板。

按以下流程执行：

1. 加载 `.specify/memory/constitution.md` 中的现有宪章。
   - 识别所有形如 `[ALL_CAPS_IDENTIFIER]` 的占位 token。
   - **重要**：用户可能需要比模板中更多或更少的原则。如果用户指定了数量，尊重该数量，并沿用模板的整体结构，相应更新文档。

2. 收集/推导占位符取值：
   - 如果用户输入（对话）提供了值，直接使用。
   - 否则从现有仓库上下文推导（README、docs、内嵌的旧版宪章等）。
   - 对治理日期：`RATIFICATION_DATE` 是最初采纳日期（未知则询问或标记 TODO），`LAST_AMENDED_DATE` 在本次有改动时设为今天，否则保持原值。
   - `CONSTITUTION_VERSION` 必须按语义化版本规则递增：
     - MAJOR：不向后兼容的治理/原则移除或重定义。
     - MINOR：新增原则/章节，或实质性扩展指导。
     - PATCH：澄清、措辞、拼写修正、非语义性细化。
   - 如果版本递增类型不明确，先提出理由再最终确定。

3. 起草更新后的宪章内容：
   - 用具体文本替换每个占位符（除非项目刻意保留某些尚未定义的模板槽位；任何保留项都必须明确说明理由）。
   - 保留标题层级；替换完成后可以移除注释，除非注释仍提供必要说明。
   - 确保每个原则章节包含：简洁名称、表达不可协商规则的段落（或项目符号列表），以及在必要时给出明确理由。
   - 确保“治理”章节列出修订流程、版本策略和合规审查预期。

4. 一致性传播检查表（将原检查表转换为主动校验）：
   - 读取 `.specify/templates/plan-template.md`，确保其中的“宪章检查”或规则与更新后的原则一致。
   - 读取 `.specify/templates/spec-template.md`，检查范围/需求对齐；如果宪章新增/移除强制章节或约束，则更新该模板。
   - 读取 `.specify/templates/tasks-template.md`，确保任务分类反映新增或移除的原则驱动任务类型（例如可观测性、版本化、测试纪律）。
   - 读取 `.specify/templates/commands/*.md` 中的每个命令文件（包括本文件），确认在需要通用指导时没有过时引用（例如仅面向特定 agent 的 CLAUDE 名称）。
   - 读取运行时指导文档（例如 `README.md`、`docs/quickstart.md` 或存在的 agent 专属指导文件）。更新与已变更原则相关的引用。

5. 生成同步影响报告（更新后作为 HTML 注释置于宪章文件顶部）：
   - 版本变更：旧版本 -> 新版本
   - 已修改原则列表（如有重命名，写旧标题 -> 新标题）
   - 新增章节
   - 移除章节
   - 需要更新的模板（用“已更新”/“待处理”标注）及文件路径
   - 如果有故意延后的占位符，列出后续 TODO。

6. 最终输出前校验：
   - 不存在未解释的方括号 token。
   - 版本行与报告一致。
   - 日期使用 ISO 格式 YYYY-MM-DD。
   - 原则具备声明性、可测试性，并避免模糊语言（例如将 "should" 替换为带理由的 MUST/SHOULD）。

7. 将完成后的宪章写回 `.specify/memory/constitution.md`（覆盖）。

8. 向用户输出最终摘要：
   - 新版本号和递增理由。
   - 任何需要人工跟进的文件。
   - 建议提交信息（例如 `docs: amend constitution to vX.Y.Z (principle additions + governance update)`）。

格式与风格要求：

- 使用与模板完全一致的 Markdown 标题层级（不要升降级标题）。
- 长理由行尽量换行以保持可读性（理想情况下 <100 字符），但不要为了硬性换行破坏表达。
- 章节之间保留一个空行。
- 避免行尾空白。

如果用户只提供了部分更新（例如只修订一条原则），仍然执行校验和版本决策步骤。

如果缺少关键信息（例如确实不知道采纳日期），插入 `TODO(<FIELD_NAME>): explanation`，并在同步影响报告的延后事项中列出。

不要创建新模板；始终操作现有 `.specify/memory/constitution.md` 文件。

## 执行后检查

**检查扩展 hook（宪章更新后）**：
检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果存在，读取它，并查找 `hooks.after_constitution` 下的条目。
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
