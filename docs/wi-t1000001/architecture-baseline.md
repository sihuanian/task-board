# 系统设计

- WorkItem：wi-t1000001（阶段 design，revision 1）
- 需求基线：`docs/wi-t1000001/requirements.md`（sha256:fce0d6369765969906fb918f378ea7f8f5ded2c97bb66483b6369197409b79f4）
- 项目类型：**已有项目**（既有任务看板单页应用），非新建项目

<!-- system-design: scope -->
## 1. 整体方案与设计基线

### 1.1 结论先行

本次变更**不需要新增任何技术层、接口、数据表或构建工具**。它是一次纯呈现层的“图标替换”：把列头“隐藏/显示列”按钮的内容由三个点符号（`•••`）换成小眼睛图形（内联 SVG），其余行为（点击切换列可见性、按钮位置、可访问性属性、状态持久化）保持现状。

改动落点只有两处，均在既有前端代码内：

| 落点 | 文件与位置 | 改动性质 |
| --- | --- | --- |
| 图标本体 | `app/app.js:96`（`render()` 内列头模板字符串中 `.column-toggle-btn` 按钮内容） | 把 `&bull;&bull;&bull;` 文本替换为内联 SVG 睁眼图标；`title`、`aria-label`、`data-toggle-col` 保持原样 |
| 图标呈现样式 | `app/style.css:339-353`（`.column-toggle-btn` 及其 `:hover`） | 由“文字符号按钮”调整为“图标按钮”：保证 SVG 垂直居中、尺寸与列头协调，并沿用现有 hover 反馈 |

不改动 `app/app.js:526-532` 的列切换事件绑定，不改动 `app/store.js` 的 `toggleColumnVisibility` / `setColumnVisibility` / `resetColumnVisibility`，不改动 `app/index.html` 顶栏“显示所有列”按钮。

### 1.2 技术栈与运行契约（沿用现状，不迁移）

确认事实（读取自当前代码基线）：

- 形态：纯前端单页应用，无框架、无构建步骤；`app/index.html` 通过 `<script src="store.js">`、`<script src="app.js">` 直接加载，样式为 `app/style.css`。
- 依赖：`package.json` 无 dependencies/devDependencies；`start` / `dev` 脚本为 `npx serve app`（静态托管 `app/` 目录）。
- 数据：`app/store.js` 使用浏览器本地存储（localStorage）持久化，含损坏兜底弹窗；无服务端、无数据库。
- 主题：`<html data-theme="light|dark">` + CSS 变量，顶栏深色模式按钮切换。

设计结论：

- **沿用现有技术栈与包管理器**：保持 vanilla JS + 原生 CSS、`app/` 静态目录与 `npm start`（`npx serve app`）启动方式，不引入 React/Vite、不引入 Hono/服务端、不改动 `package.json` 脚本。
- **不适用** CommonApp 模块选择：无服务端能力、无数据库、无认证与外部集成需求，本次不查询模块目录，不新增公共包。
- **不执行 workspace-init**：项目已有工作区结构，本次不生成 `workspace-bootstrap.json`，不生成根目录 `platform-baseline.json`。
- 运行契约无变化，本次不新增端口、环境变量或数据库参数。

### 1.3 图标技术方案（需求 4.1 与推荐基线 R1/R2/R3 的技术承载）

- **载体**：内联 SVG，直接在 `render()` 模板中生成，随每次重绘自然刷新，无需额外的图标资源文件或图标库（避免为单个图标引入依赖）。
- **风格与页面既有图标一致**：`viewBox="0 0 24 24"`、`fill="none"`、`stroke="currentColor"`、`stroke-width="2"`、`stroke-linecap="round"`、`stroke-linejoin="round"`——与 `app/index.html:33,36,39,40,47` 的导出、显示所有列、深浅模式、搜索图标同构。
- **造型**：睁眼造型（外眼眶曲线 + 中央瞳孔圆），对应“当前列可见”的语义；仅使用几何路径，不使用位图或彩色图标。
- **尺寸**：按推荐基线 R2 取约 14–16px（列头为 13px 字号环境），保持像素对齐、不放大列头高度。
- **颜色与主题**：颜色完全继承 `currentColor`，复用 `.column-toggle-btn` 现有 `color: var(--text-muted)` 及 hover 时的 `var(--text-primary)`，深色与浅色主题自动适配，不新增颜色硬编码。
- **状态语义（R1 的落地判断）**：被隐藏的列整体套用 `.column.hidden { display: none; }`（`app/style.css:355`），列头按钮本身也不渲染。**因此模板中只需输出“睁眼”造型即可覆盖全部可见场景**；模板中已有 `visible` 变量，本次不据此增加“闭眼/带斜杠”分支——因为该分支在当前交互模型下永远不可观察，属于无证据的冗余实现。若未来改为“隐藏后保留列头就地恢复”，再按 R1 补闭眼分支，属本次范围内明确排除的能力。
- **按钮盒模型调整（必要技术细节）**：现有 `.column-toggle-btn` 为文字符号按钮（`font-size: 14px; line-height: 1`）。替换为 SVG 后需保证：按钮内容行高不再依赖字体度量、SVG 以块级/弹性格子居中且无基线空隙（避免图标下沉或列头轻微增高），hover 的颜色与背景反馈（`app/style.css:350-353`）保持不变，键盘聚焦轮廓沿用浏览器默认或既有样式。

<!-- system-design: architecture-boundaries -->
## 2. 领域责任、模块边界与接口摘要

系统仅由三个内部模块构成，本次变更只触及其中一个的呈现职责，模块边界与调用方向均不变：

```text
app/index.html（静态应用壳：顶栏控件、搜索、看板容器）
        │  加载脚本
        ▼
app/app.js（视图：渲染列与卡片、绑定交互事件）
        │  读取/写入状态
        ▼
app/store.js（状态与持久化：任务、列可见性、偏好 → localStorage）
```

- **`app/app.js`（视图层，本次唯一职责变更方）**
  - 职责：把状态渲染为列与卡片 DOM；绑定点击、拖拽、编辑、搜索等交互事件。
  - 本次改动：列头 `render()` 模板中 `.column-toggle-btn` 的图标内容与（配合的）样式类使用方式；列切换事件绑定路径 `[data-toggle-col]` 保持不变。
  - 数据归属：不拥有业务事实，只按 `store.getState()` 渲染。
- **`app/store.js`（状态层，本次不改动）**
  - 职责：任务数据、列可见性（`state.columnVisibility[colKey]`）、主题偏好（`state.preferences.darkMode`）的**唯一归属方**与 localStorage 持久化。
  - 本次接口摘要（保持现状，不新增、不修改签名）：
    - `toggleColumnVisibility(col) → boolean`：翻转某列可见性并持久化，供列头按钮调用。
    - `setColumnVisibility(col, visible)` / `resetColumnVisibility()`：显式设置与全量恢复，供顶栏“显示所有列”使用。
  - 图标呈现层**不得**写入 store，也不得新增列可见性字段。
- **`app/index.html` + `app/style.css`（应用壳与样式，本次仅样式侧调整）**
  - `index.html` 不改动（顶栏按钮、脚本加载顺序保持）。
  - `style.css` 只调整 `.column-toggle-btn` 相关规则以承载 SVG 图标，不改变 `.column.hidden` 隐藏语义、不改变列布局与其它按钮样式。

### 接口与契约

本次**不产生需要前后端共同遵守的 API 契约**，因此不生成 `technical-contract.md`：无网络请求、无服务端接口、无字段级请求/响应定义；唯一的“接口”是视图层内部对 `store` 的既有方法调用，已在上面以接口摘要登记。

### 复用结论

- 直接复用：既有 `store` 列可见性 API、既有 CSS 变量主题体系、既有内联 SVG 描边图标风格（`app/index.html` 中已有同规格图标可直接作为造型与线宽的参照）。
- 项目内新建：仅新增一段内联 SVG 图标标记，无新文件、无新公共模块。

## 3. UI 基线

本次为**既有看板的局部图标呈现变更**，不改动全局 UI 呈现基线，结论如下：

- **不重新选择展示模板**：需求只要求替换单个按钮的图标，未要求改变页面结构、导航或主工作流布局，因此沿用现有三列看板工作台界面；本阶段不引入新的展示模板 ID，也不替换既有布局。
- **视觉风格**：沿用现有界面风格（中性底色、CSS 变量主题、细描边图标、克制的 hover 反馈），新图标必须与既有 SVG 图标的线宽与风格一致（需求 5 视觉一致性）。
- **布局与应用壳**：顶栏（标题 + 导出 / 显示所有列 / 深色模式）+ 搜索栏 + 三列看板，保持不变。
- **目标设备**：桌面 Web（浏览器），沿用当前可用桌面视口；需求未要求移动端/窄屏，故本次不设计、不验收窄屏形态。
- **全局状态**：沿用现有“存储不可用错误横幅”“数据损坏确认弹窗”“空列提示（暂无任务）”“撤销删除 snackbar”等状态呈现，本次不新增或改动。
- **主题适配**：新图标通过 `currentColor` 复用主题文本色，浅色与深色主题下均需可辨识。

## 4. 关键决策

本次唯一的实质取舍是“图标载体选择”，其影响仅限实现方式，不改变系统边界、数据权威、权限或外部依赖，因此**不单独建立架构决策记录（ADR）**，结论直接登记于此：

- 决策：采用**内联 SVG** 而非图标字体、位图或第三方图标库。
- 依据：页面既有图标已统一为内联描边 SVG；引入字体或图标库会新增依赖与加载路径，与“零外部依赖”的现有项目形态冲突，成本高于收益。
- 影响：图标随模板重绘天然刷新；样式需承载 SVG 盒模型（见 1.3）；无新增文件与构建步骤。

## 5. 下游实现边界提示（不含任务与排期）

- 允许修改：`app/app.js`（仅列头按钮图标标记）、`app/style.css`（仅 `.column-toggle-btn` 相关规则）。
- 明确不改：`app/store.js`、`app/index.html`、`.column.hidden` 隐藏语义、顶栏“显示所有列”按钮、列数量与列含义、拖拽 / 内联编辑 / 搜索 / 导出等既有功能。
- 交付验收需在真实浏览器中进行（AC-01~AC-05）：确认按钮呈现眼睛 SVG 且页面不再出现 `•••`；点击眼睛可隐藏该列；顶栏“显示所有列”可恢复且无残留三点；`title` / `aria-label` 保留且可键盘聚焦；浅色与深色主题下图标均清晰。