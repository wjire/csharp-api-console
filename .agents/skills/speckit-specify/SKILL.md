---
name: "speckit-specify"
description: "根据自然语言功能描述创建或更新功能规格说明。"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/specify.md"
---


## 用户输入

```text
$ARGUMENTS
```

继续之前，你**必须**先考虑用户输入（如果输入不为空）。

## 输出语言要求

除非用户明确要求使用其他语言，否则本命令生成或更新的所有用户可见 Markdown 产物（包括 `spec.md` 和 `checklists/requirements.md`）都必须使用简体中文。保留代码标识符、文件路径、命令、占位符、需求 ID（如 `FR-###`）、场景 ID（如 `US1`）以及其他机器可读 token 的原文。

## 执行前检查

**检查扩展 hook（规格生成前）**：
- 检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果存在，读取它，并查找 `hooks.before_specify` 下的条目。
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

触发消息中用户在 `/speckit-specify` 之后输入的文本，**就是功能描述**。即使下面字面出现 `$ARGUMENTS`，也假定你在当前对话中始终可以拿到这段描述。除非用户输入的是空命令，否则不要要求用户重复描述。

基于这段功能描述，按下面步骤执行：

1. **为功能生成简短名称**（2-4 个词）：
   - 分析功能描述，提取最有意义的关键词。
   - 创建一个 2-4 个词的短名称，准确概括功能本质。
   - 尽量使用“动作-名词”格式（例如 `add-user-auth`、`fix-payment-bug`）。
   - 保留技术术语和缩写（OAuth2、API、JWT 等）。
   - 名称要简洁，但也要足够描述性，让人一眼理解功能。
   - 示例：
     - “I want to add user authentication” -> `user-auth`
     - “Implement OAuth2 integration for the API” -> `oauth2-api-integration`
     - “Create a dashboard for analytics” -> `analytics-dashboard`
     - “Fix payment processing timeout bug” -> `fix-payment-timeout`

2. **创建分支**（可选，通过 hook 完成）：

   如果执行前检查中的 `before_specify` hook 成功运行，它会创建/切换到 git 分支，并输出包含 `BRANCH_NAME` 和 `FEATURE_NUM` 的 JSON。记录这些值作为参考，但分支名**不决定**规格目录名。

   如果用户明确提供了 `GIT_BRANCH_NAME`，将其透传给 hook，让分支脚本使用该精确值作为分支名（绕过所有前缀/后缀生成）。

3. **创建规格功能目录**：

   除非用户明确提供 `SPECIFY_FEATURE_DIRECTORY`，规格默认存放在 `specs/` 目录下。

   **`SPECIFY_FEATURE_DIRECTORY` 的解析顺序**：
   1. 如果用户明确提供了 `SPECIFY_FEATURE_DIRECTORY`（例如通过环境变量、参数或配置），原样使用。
   2. 否则，在 `specs/` 下自动生成：
      - 检查 `.specify/init-options.json` 中的 `feature_numbering`（优先）或 `branch_numbering`（已废弃，仅用于迁移；未来版本会移除）。
      - 如果为 `"timestamp"`：前缀使用 `YYYYMMDD-HHMMSS`（当前时间戳）。
      - 如果为 `"sequential"` 或缺省：前缀使用 `NNN`（扫描 `specs/` 中已有目录后取下一个 3 位编号）。
      - 目录名格式：`<prefix>-<short-name>`（例如 `003-user-auth` 或 `20260319-143022-user-auth`）。
      - 将 `SPECIFY_FEATURE_DIRECTORY` 设置为 `specs/<directory-name>`。
      - 如果使用了 `branch_numbering`（且没有 `feature_numbering`），输出一行警告：`⚠️ init-options.json 中的 branch_numbering 已废弃。请改名为 feature_numbering。`

   **创建目录和规格文件**：
   - `mkdir -p SPECIFY_FEATURE_DIRECTORY`
   - 通过 Spec Kit preset/template 解析栈解析当前生效的 `spec-template`（等价于 `specify preset resolve spec-template`）。
   - 将解析得到的 `spec-template` 复制到 `SPECIFY_FEATURE_DIRECTORY/spec.md` 作为起点。
   - 将 `SPEC_FILE` 设置为 `SPECIFY_FEATURE_DIRECTORY/spec.md`。
   - 将解析后的路径持久化到 `.specify/feature.json`：
     ```json
     {
       "feature_directory": "<resolved feature dir>"
     }
     ```
     写入真实解析后的目录路径值（例如 `specs/003-user-auth`），不要写入字面字符串 `SPECIFY_FEATURE_DIRECTORY`。
     这样后续命令（`/speckit-plan`、`/speckit-tasks` 等）无需依赖 git 分支命名约定，也能定位功能目录。

   **重要**：
   - 每次 `/speckit-specify` 调用只能创建一个功能。
   - 规格目录名和 git 分支名相互独立。它们可以相同，但这应由用户选择。
   - 规格目录和文件始终由本命令创建，绝不由 hook 创建。

4. 加载解析后的当前生效 `spec-template`，理解它要求的章节。

5. **如果存在**：加载 `.specify/memory/constitution.md`，读取项目原则和治理约束。

6. 按以下执行流程工作：
    1. 从参数中解析用户描述。
       如果为空：报错 `No feature description provided`。
    2. 从描述中提取关键概念。
       识别：参与者、动作、数据、约束。
    3. 对不清楚的部分：
       - 基于上下文、行业惯例和常见模式做合理推断。
       - 仅在以下情况使用 `[NEEDS CLARIFICATION: specific question]` 标记：
         - 该选择会显著影响功能范围或用户体验。
         - 存在多个合理解释，且影响不同。
         - 没有合理默认值。
       - **限制：最多 3 个 `[NEEDS CLARIFICATION]` 标记**
       - 按影响优先级排序：范围 > 安全/隐私 > 用户体验 > 技术细节。
    4. 填写“用户场景与测试”章节。
       如果无法确定清晰用户流程：报错 `Cannot determine user scenarios`。
    5. 生成“功能需求”。
       每条需求都必须可测试。
       对未说明的细节使用合理默认值，并在“假设”章节记录假设。
    6. 定义“成功标准”。
       创建可衡量、与技术无关的结果。
       同时包含定量指标（时间、性能、数量、比例）和定性指标（用户满意度、任务完成情况）。
       每条标准都必须在不了解实现细节的情况下验证。
    7. 如果涉及数据，识别“关键实体”。
    8. 返回：SUCCESS（规格已可进入计划阶段）。

7. 使用模板结构将规格写入 `SPEC_FILE`，把占位内容替换为从功能描述（参数）中推导出的具体细节，同时保持章节顺序和标题。

8. **规格质量校验**：初版规格写入后，根据质量标准校验：

   a. **创建规格质量检查表**：在 `SPECIFY_FEATURE_DIRECTORY/checklists/requirements.md` 创建检查表文件，使用以下结构和校验项：

      ```markdown
      # 规格质量检查表：[FEATURE NAME]

      **目的**：在进入计划阶段前，验证规格的完整性和质量
      **创建时间**：[DATE]
      **功能**：[链接到 spec.md]

      ## 内容质量

      - [ ] 不包含实现细节（语言、框架、API）
      - [ ] 聚焦用户价值和业务需求
      - [ ] 面向非技术干系人编写
      - [ ] 所有必填章节均已完成

      ## 需求完整性

      - [ ] 不存在 [NEEDS CLARIFICATION] 标记
      - [ ] 需求可测试且无歧义
      - [ ] 成功标准可衡量
      - [ ] 成功标准与技术无关（不包含实现细节）
      - [ ] 所有验收场景均已定义
      - [ ] 边界情况已识别
      - [ ] 范围边界清晰
      - [ ] 依赖和假设已识别

      ## 功能就绪度

      - [ ] 所有功能需求都有清晰验收标准
      - [ ] 用户场景覆盖主要流程
      - [ ] 功能满足“成功标准”中定义的可衡量结果
      - [ ] 没有实现细节泄漏到规格中

      ## 备注

      - 未完成项需要先更新规格，然后再运行 `/speckit-clarify` 或 `/speckit-plan`
      ```

   b. **运行校验**：逐项审阅规格：
      - 判断每一项通过或失败。
      - 记录发现的具体问题（引用相关规格片段）。

   c. **处理校验结果**：

      - **如果所有项目通过**：将检查表标记为完成，然后进入“强制执行后 hook”章节。

      - **如果存在失败项（不包括 [NEEDS CLARIFICATION]）**：
        1. 列出失败项和具体问题。
        2. 更新规格以解决每个问题。
        3. 重新校验，直到所有项目通过（最多 3 轮）。
        4. 如果 3 轮后仍失败，在检查表备注中记录剩余问题，并警告用户。

      - **如果仍存在 [NEEDS CLARIFICATION] 标记**：
        1. 从规格中提取所有 `[NEEDS CLARIFICATION: ...]` 标记。
        2. **数量检查**：如果超过 3 个，只保留按范围/安全/用户体验影响排序最关键的 3 个，其余用合理推断补足。
        3. 对每个需要澄清的问题（最多 3 个），按以下格式向用户展示选项：

           ```markdown
           ## 问题 [N]：[主题]

           **上下文**：[引用相关规格片段]

           **需要确认**：[NEEDS CLARIFICATION 标记中的具体问题]

           **建议答案**：

           | 选项 | 答案 | 影响 |
           |------|------|------|
           | A | [第一个建议答案] | [这对功能意味着什么] |
           | B | [第二个建议答案] | [这对功能意味着什么] |
           | C | [第三个建议答案] | [这对功能意味着什么] |
           | 自定义 | 提供你自己的答案 | [说明如何提供自定义输入] |

           **你的选择**：_[等待用户回复]_
           ```

        4. **关键：表格格式**：
           - 使用一致的管道符和空格。
           - 每个单元格内容两侧应有空格：`| 内容 |`，不要写成 `|内容|`。
           - 表头分隔线至少 3 个短横线：`|------|`。
           - 确保表格在 Markdown 预览中能正确渲染。
        5. 问题按顺序编号（Q1、Q2、Q3，最多 3 个）。
        6. 一次性展示所有问题，然后等待用户回答。
        7. 等待用户对所有问题给出选择（例如：`Q1: A, Q2: 自定义 - [细节], Q3: B`）。
        8. 根据用户选择或自定义答案，替换规格中的每个 `[NEEDS CLARIFICATION]` 标记。
        9. 澄清全部解决后重新运行校验。

   d. **更新检查表**：每一轮校验后，都用当前通过/失败状态更新检查表文件。

## 强制执行后 Hook

**在向用户报告完成之前，你必须完成本章节。**

检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果不存在，或没有在 `hooks.after_specify` 下注册 hook，跳到“完成报告”。
- 如果存在，读取它，并查找 `hooks.after_specify` 下的条目。
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

向用户报告完成，并包含：
- `SPECIFY_FEATURE_DIRECTORY`：功能目录路径。
- `SPEC_FILE`：规格文件路径。
- 检查表结果摘要。
- 是否已准备好进入下一阶段（`/speckit-clarify` 或 `/speckit-plan`）。

**注意**：分支创建由 `before_specify` hook（git extension）处理。规格目录和文件始终由这个核心命令处理。

## 快速准则

- 聚焦用户需要**什么**以及**为什么**需要。
- 避免说明**如何**实现（不要写技术栈、API、代码结构）。
- 面向业务干系人编写，而不是面向开发者。
- 不要在规格中嵌入任何检查表。检查表由单独命令生成。

### 章节要求

- **必填章节**：每个功能都必须完成。
- **可选章节**：仅在与功能相关时保留。
- 如果某个章节不适用，直接移除整个章节（不要留下 “N/A”）。

### AI 生成要求

从用户提示创建规格时：

1. **做合理推断**：用上下文、行业惯例和常见模式补足缺口。
2. **记录假设**：在“假设”章节记录合理默认值。
3. **限制澄清项**：最多 3 个 `[NEEDS CLARIFICATION]` 标记；只用于以下关键决策：
   - 显著影响功能范围或用户体验。
   - 存在多个合理解释且影响不同。
   - 没有任何合理默认值。
4. **澄清优先级**：范围 > 安全/隐私 > 用户体验 > 技术细节。
5. **像测试人员一样思考**：任何模糊需求都应该无法通过“可测试且无歧义”检查项。
6. **常见需要澄清的领域**（仅在没有合理默认值时）：
   - 功能范围和边界（包含/排除哪些具体用例）。
   - 用户类型和权限（如果存在多个冲突解释）。
   - 安全/合规要求（当具有法律、财务或隐私影响时）。

**合理默认值示例**（不要为这些内容提问）：

- 数据保留：采用该领域的行业标准做法。
- 性能目标：除非另有说明，采用标准 Web/移动应用期望。
- 错误处理：提供对用户友好的消息和合适的兜底。
- 身份认证方式：Web 应用默认使用标准会话或 OAuth2。
- 集成模式：使用与项目类型匹配的模式（Web 服务用 REST/GraphQL、库用函数调用、工具用 CLI 参数等）。

### 成功标准准则

成功标准必须：

1. **可衡量**：包含具体指标（时间、百分比、数量、比例）。
2. **与技术无关**：不提框架、语言、数据库或工具。
3. **以用户为中心**：描述用户/业务视角的结果，而不是系统内部实现。
4. **可验证**：在不了解实现细节的情况下也能测试/验证。

**好的示例**：

- “用户可以在 3 分钟内完成结账。”
- “系统支持 10,000 名并发用户。”
- “95% 的搜索在 1 秒内返回结果。”
- “任务完成率提升 40%。”

**不好的示例**（偏实现）：

- “API 响应时间低于 200ms”（过于技术化，应改为“用户能即时看到结果”）。
- “数据库可以处理 1000 TPS”（实现细节，应改为用户可感知指标）。
- “React 组件高效渲染”（框架特定）。
- “Redis 缓存命中率高于 80%”（技术特定）。

## 完成条件

- [ ] 规格已写入 `SPEC_FILE`，并通过质量检查表校验。
- [ ] 扩展 hook 已按“强制执行后 Hook”规则执行或跳过。
- [ ] 已向用户报告功能目录、规格文件路径和检查表结果。
