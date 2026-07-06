---
name: "speckit-taskstoissues"
description: "基于可用设计产物，将现有任务转换为可执行、按依赖排序的 GitHub issues。"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/taskstoissues.md"
---


## 用户输入

```text
$ARGUMENTS
```

继续之前，你**必须**先考虑用户输入（如果输入不为空）。

## 执行前检查

**检查扩展 hook（任务转 issue 前）**：
- 检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果存在，读取它，并查找 `hooks.before_taskstoissues` 下的条目。
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

1. 从仓库根目录运行 `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`，并解析 `FEATURE_DIR` 和 `AVAILABLE_DOCS` 列表。所有路径都必须是绝对路径。如果参数中包含单引号，例如 `"I'm Groot"`，使用转义语法：`'I'\''m Groot'`（如果可行，也可以使用双引号：`"I'm Groot"`）。
1. **如果存在**：加载 `.specify/memory/constitution.md`，获取项目原则和治理约束。
1. 从脚本执行结果中提取 **tasks** 路径。
1. 运行以下命令获取 Git remote：

```bash
git config --get remote.origin.url
```

> [!CAUTION]
> 只有 remote 是 GitHub URL 时，才可以继续后续步骤。

1. **获取现有 issues 以便去重**：创建任何 issue 之前，先从 `tasks.md` 中构建即将处理的任务 ID 集合（每个 ID 是 `T` 加三位数字，例如 `T001`）。然后使用 GitHub MCP server 的 `list_issues` 工具查找已覆盖这些 ID 的 issues。不要传入 `state`，因为省略该值会同时返回 open 和 closed issues。请求 `perPage: 100` 以减少调用次数；由于该工具使用基于游标的分页，请用上一页响应中的 `endCursor` 作为 `after` 参数继续请求。对每个 issue title，使用任务 ID 模式 `\bT\d{3}\b` 匹配（使用 word boundaries，避免误匹配 `ST001` 或 `T0010`；同时识别 `T001 ...`、`T001: ...` 或 `[T001] ...` 等标题形式）。如果匹配到当前任务 ID，则标记该 ID 已有 issue。只要所有任务 ID 都已匹配，或没有更多页面，就停止分页，避免在大型仓库中无谓拉取完整 issue 历史。这样既限制调用次数，也能在 `tasks.md` 重新生成或 skill 重新调用时避免重复创建。
1. 对任务列表中的每个任务，使用 GitHub MCP server 在与 Git remote 对应的仓库中创建新 issue。`tasks.md` 中的任务行以 markdown checkbox 开头，因此先移除前导 `- [ ]`（以及任何 `[P]` / `[US#]` 标记），还原任务 ID 和描述。创建 issue 时使用唯一规范标题 `T001: <description>`，即 ID 只写一次，后接任务描述（例如 `- [ ] T001 创建项目结构` 变成标题 `T001: 创建项目结构`）。
   - **跳过**任何已出现在上一步现有 issue 集合中的任务 ID，并报告它（例如 `T001 已有 issue，跳过`）。
   - 只为尚无匹配 issue 的任务创建 issue。

> [!CAUTION]
> 在任何情况下，都不要在与 remote URL 不匹配的仓库中创建 issue。

## 执行后检查

**检查扩展 hook（任务转 issue 后）**：
检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果存在，读取它，并查找 `hooks.after_taskstoissues` 下的条目。
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
