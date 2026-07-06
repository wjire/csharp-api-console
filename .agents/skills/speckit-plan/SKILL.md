---
name: "speckit-plan"
description: "使用计划模板执行实现规划流程，并生成设计产物。"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/plan.md"
---


## 用户输入

```text
$ARGUMENTS
```

继续之前，你**必须**先考虑用户输入（如果输入不为空）。

## 执行前检查

**检查扩展 hook（计划生成前）**：
- 检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果存在，读取它，并查找 `hooks.before_plan` 下的条目。
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

1. **准备**：从仓库根目录运行 `.specify/scripts/powershell/setup-plan.ps1 -Json`，并解析 JSON 中的 `FEATURE_SPEC`、`IMPL_PLAN`、`SPECS_DIR`、`BRANCH`。如果参数中包含单引号，例如 `"I'm Groot"`，使用转义语法：`'I'\''m Groot'`（如果可行，也可以使用双引号：`"I'm Groot"`）。

2. **加载上下文**：读取 `FEATURE_SPEC` 和 `.specify/memory/constitution.md`。加载 `IMPL_PLAN` 模板（脚本已复制）。

3. **执行计划流程**：按 `IMPL_PLAN` 模板结构完成：
   - 填写“技术上下文”（未知项标记为 `NEEDS CLARIFICATION`）。
   - 根据宪章填写“宪章检查”。
   - 评估门禁（如果有未说明理由的违规项，则报错）。
   - 阶段 0：生成 `research.md`（解决所有 `NEEDS CLARIFICATION`）。
   - 阶段 1：生成 `data-model.md`、`contracts/`、`quickstart.md`。
   - 阶段 1：运行 agent 脚本以更新 agent 上下文。
   - 设计完成后重新评估“宪章检查”。

## 强制执行后 Hook

**在向用户报告完成之前，你必须完成本章节。**

检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果不存在，或没有在 `hooks.after_plan` 下注册 hook，跳到“完成报告”。
- 如果存在，读取它，并查找 `hooks.after_plan` 下的条目。
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

命令在阶段 2 规划完成后结束。报告：
- 当前分支
- `IMPL_PLAN` 路径
- 已生成的设计产物

## 阶段

### 阶段 0：大纲与研究

1. **从上方“技术上下文”提取未知项**：
   - 每个 `NEEDS CLARIFICATION` -> 一个研究任务
   - 每个依赖 -> 一个最佳实践任务
   - 每个集成 -> 一个模式研究任务

2. **生成并分派研究任务**：

   ```text
   对“技术上下文”中的每个未知项：
     任务："研究 {unknown} 对 {feature context} 的影响"
   对每个技术选择：
     任务："查找 {tech} 在 {domain} 中的最佳实践"
   ```

3. **汇总研究结果**到 `research.md`，格式如下：
   - 决策：[选择了什么]
   - 理由：[为什么这样选]
   - 已考虑的替代方案：[评估过哪些替代方案]

**输出**：`research.md`，且所有 `NEEDS CLARIFICATION` 已解决

### 阶段 1：设计与契约

**前置条件**：`research.md` 完成

1. **从功能规格提取实体** -> `data-model.md`：
   - 实体名称、字段、关系
   - 来自需求的校验规则
   - 如适用，记录状态流转

2. **定义接口契约**（如果项目存在外部接口）-> `contracts/`：
   - 识别项目暴露给用户或其他系统的接口。
   - 根据项目类型记录合适的契约格式。
   - 示例：库的公开 API、CLI 工具的命令 schema、Web 服务端点、解析器语法、应用 UI 契约。
   - 如果项目纯内部使用（构建脚本、一次性工具等），可以跳过。

3. **创建 quickstart 验证指南** -> `quickstart.md`：
   - 记录可运行的验证场景，证明功能端到端可用。
   - 包含前置条件、设置命令、测试/运行命令和预期结果。
   - 使用链接或引用指向契约和数据模型细节，避免重复。
   - 不要包含完整实现代码、model/service/controller 主体、迁移文件或完整测试套件。
   - 该产物应是验证/运行指南；实现细节属于 `tasks.md` 和实现阶段。

**输出**：`data-model.md`、`contracts/*`、`quickstart.md`

## 关键规则

- 文件系统操作使用绝对路径；文档引用使用项目相对路径。
- 如果门禁失败或仍有未解决澄清项，必须报错。

## 完成条件

- [ ] 计划流程已执行，设计产物已生成。
- [ ] 扩展 hook 已按“强制执行后 Hook”规则执行或跳过。
- [ ] 已向用户报告分支、计划路径和生成产物。
