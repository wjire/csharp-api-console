---
name: "speckit-implement"
description: "处理并执行 tasks.md 中定义的所有任务，完成实现计划。"
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/implement.md"
---


## 用户输入

```text
$ARGUMENTS
```

继续之前，你**必须**先考虑用户输入（如果输入不为空）。

## 执行前检查

**检查扩展 hook（实现前）**：
- 检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果存在，读取它，并查找 `hooks.before_implement` 下的条目。
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

2. **检查检查表状态**（如果存在 `FEATURE_DIR/checklists/`）：
   - 扫描 `checklists/` 目录中的所有检查表文件。
   - 对每个检查表统计：
     - 总项数：所有匹配 `- [ ]`、`- [X]` 或 `- [x]` 的行
     - 已完成项：匹配 `- [X]` 或 `- [x]` 的行
     - 未完成项：匹配 `- [ ]` 的行
   - 创建状态表：

     ```text
     | 检查表 | 总数 | 已完成 | 未完成 | 状态 |
     |--------|------|--------|--------|------|
     | ux.md  | 12   | 12     | 0      | ✓ PASS |
     | test.md | 8   | 5      | 3      | ✗ FAIL |
     | security.md | 6 | 6     | 0      | ✓ PASS |
     ```

   - 计算整体状态：
     - **PASS**：所有检查表的未完成项均为 0
     - **FAIL**：一个或多个检查表存在未完成项

   - **如果有任何检查表未完成**：
     - 展示包含未完成数量的状态表。
     - **停止**并询问："部分检查表尚未完成。是否仍要继续实现？(yes/no)"
     - 等待用户回复后再继续。
     - 如果用户回答 "no"、"wait" 或 "stop"，停止执行。
     - 如果用户回答 "yes"、"proceed" 或 "continue"，继续步骤 3。

   - **如果所有检查表都已完成**：
     - 展示所有检查表通过的状态表。
     - 自动继续步骤 3。

3. 加载并分析实现上下文：
   - **必需**：读取 `tasks.md`，获取完整任务列表和执行计划。
   - **必需**：读取 `plan.md`，获取技术栈、架构和文件结构。
   - **如果存在**：读取 `data-model.md`，获取实体和关系。
   - **如果存在**：读取 `contracts/`，获取 API 规格和测试要求。
   - **如果存在**：读取 `research.md`，获取技术决策和约束。
   - **如果存在**：读取 `.specify/memory/constitution.md`，获取治理约束。
   - **如果存在**：读取 `quickstart.md`，获取集成场景。

4. **项目设置校验**：
   - **必需**：根据实际项目设置创建/校验 ignore 文件。

   **检测与创建逻辑**：
   - 检查以下命令是否成功，以判断仓库是否为 git 仓库（如果是，则创建/校验 `.gitignore`）：

     ```sh
     git rev-parse --git-dir 2>/dev/null
     ```

   - 检查是否存在 `Dockerfile*`，或 `plan.md` 中是否提到 Docker → 创建/校验 `.dockerignore`
   - 检查是否存在 `.eslintrc*` → 创建/校验 `.eslintignore`
   - 检查是否存在 `eslint.config.*` → 确保配置中的 `ignores` 覆盖必要模式
   - 检查是否存在 `.prettierrc*` → 创建/校验 `.prettierignore`
   - 检查是否存在 `.npmrc` 或 `package.json` → 如需发布，创建/校验 `.npmignore`
   - 检查是否存在 terraform 文件（`*.tf`）→ 创建/校验 `.terraformignore`
   - 检查是否需要 `.helmignore`（存在 helm charts）→ 创建/校验 `.helmignore`

   **如果 ignore 文件已存在**：确认它包含必要模式，只追加缺失的关键模式。
   **如果 ignore 文件缺失**：按检测到的技术创建完整模式集。

   **按技术栈划分的常见模式**（来自 `plan.md` 技术栈）：
   - **Node.js/JavaScript/TypeScript**：`node_modules/`、`dist/`、`build/`、`*.log`、`.env*`
   - **Python**：`__pycache__/`、`*.pyc`、`.venv/`、`venv/`、`dist/`、`*.egg-info/`
   - **Java**：`target/`、`*.class`、`*.jar`、`.gradle/`、`build/`
   - **C#/.NET**：`bin/`、`obj/`、`*.user`、`*.suo`、`packages/`
   - **Go**：`*.exe`、`*.test`、`vendor/`、`*.out`
   - **Ruby**：`.bundle/`、`log/`、`tmp/`、`*.gem`、`vendor/bundle/`
   - **PHP**：`vendor/`、`*.log`、`*.cache`、`*.env`
   - **Rust**：`target/`、`debug/`、`release/`、`*.rs.bk`、`*.rlib`、`*.prof*`、`.idea/`、`*.log`、`.env*`
   - **Kotlin**：`build/`、`out/`、`.gradle/`、`.idea/`、`*.class`、`*.jar`、`*.iml`、`*.log`、`.env*`
   - **C++**：`build/`、`bin/`、`obj/`、`out/`、`*.o`、`*.so`、`*.a`、`*.exe`、`*.dll`、`.idea/`、`*.log`、`.env*`
   - **C**：`build/`、`bin/`、`obj/`、`out/`、`*.o`、`*.a`、`*.so`、`*.exe`、`*.dll`、`autom4te.cache/`、`config.status`、`config.log`、`.idea/`、`*.log`、`.env*`
   - **Swift**：`.build/`、`DerivedData/`、`*.swiftpm/`、`Packages/`
   - **R**：`.Rproj.user/`、`.Rhistory`、`.RData`、`.Ruserdata`、`*.Rproj`、`packrat/`、`renv/`
   - **通用**：`.DS_Store`、`Thumbs.db`、`*.tmp`、`*.swp`、`.vscode/`、`.idea/`

   **工具专属模式**：
   - **Docker**：`node_modules/`、`.git/`、`Dockerfile*`、`.dockerignore`、`*.log*`、`.env*`、`coverage/`
   - **ESLint**：`node_modules/`、`dist/`、`build/`、`coverage/`、`*.min.js`
   - **Prettier**：`node_modules/`、`dist/`、`build/`、`coverage/`、`package-lock.json`、`yarn.lock`、`pnpm-lock.yaml`
   - **Terraform**：`.terraform/`、`*.tfstate*`、`*.tfvars`、`.terraform.lock.hcl`
   - **Kubernetes/k8s**：`*.secret.yaml`、`secrets/`、`.kube/`、`kubeconfig*`、`*.key`、`*.crt`

5. 解析 `tasks.md` 结构并提取：
   - **任务阶段**：Setup、Tests、Core、Integration、Polish
   - **任务依赖**：顺序执行与并行执行规则
   - **任务细节**：ID、描述、文件路径、并行标记 `[P]`
   - **执行流程**：顺序和依赖要求

6. 按任务计划执行实现：
   - **逐阶段执行**：完成当前阶段后再进入下一阶段。
   - **尊重依赖**：顺序任务按顺序运行；并行任务 `[P]` 可一起执行。
   - **遵循 TDD 方法**：先执行测试任务，再执行对应实现任务。
   - **基于文件协调**：影响同一文件的任务必须顺序执行。
   - **校验检查点**：进入下一阶段前确认当前阶段已完成。

7. 实现执行规则：
   - **先做准备**：初始化项目结构、依赖和配置。
   - **先测后码**：如果需要为契约、实体和集成场景编写测试，先写并运行测试。
   - **核心开发**：实现模型、服务、CLI 命令和端点。
   - **集成工作**：数据库连接、中间件、日志和外部服务。
   - **润色与验证**：单元测试、性能优化和文档。

8. 进度跟踪与错误处理：
   - 每完成一个任务都报告进度。
   - 如果任何非并行任务失败，停止执行。
   - 对并行任务 `[P]`，继续处理成功任务，并报告失败任务。
   - 提供清晰且包含上下文的错误信息，便于调试。
   - 如果无法继续实现，建议下一步。
   - **重要**：任务完成后，务必在 tasks 文件中将对应任务标记为 `[X]`。

9. 完成校验：
   - 确认所有必需任务都已完成。
   - 检查实现是否匹配原始规格。
   - 校验测试通过，覆盖率达到要求。
   - 确认实现遵循技术计划。

注意：此命令假定 `tasks.md` 中已经存在完整任务拆分。如果任务不完整或缺失，建议先运行 `/speckit-tasks` 重新生成任务列表。

## 强制执行后 Hook

**在向用户报告完成之前，你必须完成本章节。**

检查项目根目录下是否存在 `.specify/extensions.yml`。
- 如果不存在，或没有在 `hooks.after_implement` 下注册 hook，跳到“完成报告”。
- 如果存在，读取它，并查找 `hooks.after_implement` 下的条目。
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

报告最终状态，并总结已完成工作。

## 完成条件

- [ ] `tasks.md` 中所有任务都已完成并标记为 `[X]`
- [ ] 实现已根据规格、计划和测试覆盖进行验证
- [ ] 扩展 hook 已按“强制执行后 Hook”规则执行或跳过
- [ ] 已向用户报告完成情况和工作摘要
