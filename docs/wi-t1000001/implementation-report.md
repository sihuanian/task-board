# 实现报告：卡片三点图标更换（列头隐藏/显示按钮改为小眼睛图标）

- WorkItem：wi-t1000001
- 阶段：implementation（revision 4）
- 计划：plan:fd2e0413-ed4a-4466-a863-967b0daeaef1（已批准）
- 任务前沿：T01 → completed（attempts 1，无阻塞）
- 需求基线：`docs/wi-t1000001/requirements.md`（sha256:fce0d6369765969906fb918f378ea7f8f5ded2c97bb66483b6369197409b79f4）
- 设计基线：`docs/wi-t1000001/architecture-baseline.md`（sha256:1951d4ba3021ef026b65f19a001ea4a61e65f5e758da42c2ced2fde109e2be78）

## 1. 变更行为与范围

看板每列头部“隐藏/显示列”按钮的呈现由三点符号 `•••` 改为与页面既有图标同规格的内联描边小眼睛 SVG；按钮的 `title="隐藏/显示列"`、`aria-label="切换{列}列可见性"`、`data-toggle-col` 与点击切换逻辑保持原样。

| 落点 | 改动摘要 |
| --- | --- |
| `app/app.js:96`（列头 `render()` 模板） | 按钮内容替换为 `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`（外眼眶 path + 中央瞳孔 circle）；`title`/`aria-label`/`data-toggle-col` 未变 |
| `app/style.css:339` | `.column-toggle-btn` 改为 `inline-flex` + `align-items/justify-content: center` + `line-height: 0`，并新增 `.column-toggle-btn svg { display:block; width:16px; height:16px }`，保证 SVG 垂直居中、无基线空隙 |

保持不变（明确不改）：`app/store.js`、`app/index.html`、列切换事件绑定 `app/app.js:526-532`、`.column-toggle-btn:hover` 反馈、`.column.hidden { display:none }` 隐藏语义、顶栏“显示所有列”按钮。

未新增“闭眼/斜杠”图标分支：被隐藏列整体 `display:none`，该分支在当前交互模型下不可观察，按设计基线 1.3 节判定为冗余实现（属需求 6 节明确排除的能力）。

## 2. 开发侧验证证据

| checkId | 命令 | 结果 | 退出码 |
| --- | --- | --- | --- |
| T01:verification:1 | `node --check app/app.js` | passed | 0 |
| T01:verification:2 | 静态断言（无 `&bull;&bull;&bull;`、`column-toggle-btn`+`data-toggle-col` 存在、`viewBox="0 0 24 24"` 存在、`.column-toggle-btn` 样式存在） | passed（输出 `icon-replacement-static-check ok`） | 0 |

补充核对（协调者复核工作区实际改动）：`git diff --stat` = `app/app.js` +4/-1、`app/style.css` +12/-2；`grep "bull;&bull" app/app.js` 无匹配（无残留三点符号）。

## 3. 验收条件记录

| AC | 强制程度 | 当前状态 | 证据与说明 |
| ---- | -------- | -------- | ---------- |
| AC-01 | 必须 | passed（开发侧） | 列头按钮渲染 16×16 内联眼睛 SVG；页面代码中不再出现该按钮原先的三点符号 `•••`。DOM/属性检查已执行。 |
| AC-02 | 必须 | passed（开发侧） | 点击待办列眼睛按钮后该列隐藏（`visible=[in-progress, done]`），切换绑定 `[data-toggle-col]` 未丢失。QA 真实浏览器点击闭环待验收阶段复核。 |
| AC-03 | 必须 | passed（开发侧） | 点击顶栏“显示所有列”后 3 列全部恢复可见，3 个按钮均重新渲染眼睛 SVG，无三点残留。 |
| AC-04 | 必须 | passed（开发侧，部分） | 按钮保留 `title="隐藏/显示列"` 与含列名与可见性切换语义的 `aria-label`，`<button>` 元素默认可键盘聚焦。可访问性朗读的实际表现属 QA 验收范围。 |
| AC-05 | 推荐 | passed（开发侧） | 深色主题下图标 `color` 继承 `var(--text-muted)`，`stroke="currentColor"` 随主题变量适配；与 `app/index.html` 既有描边图标同规格（线宽 2、round 端点）。视觉对比截图属 QA 验收范围。 |

## 4. 遗留风险与边界

- AC-02 / AC-03 的完整浏览器点击闭环与 AC-05 的浅色/深色视觉对比截图属 QA 验收职责；本阶段仅出具开发侧呈现与属性核对证据，未出具 QA 级通过证据。
- 窗口缩放 / 窄屏形态按设计基线第 3 节不在本次范围内。
- 列可见性状态的持久化行为（`store.toggleColumnVisibility` / `setColumnVisibility` / `resetColumnVisibility`）未改动，与现状一致。
- 阻塞项：无。

## 5. 交付产物

- 源码改动：`app/app.js`、`app/style.css`（本 WorkItem 范围内）。
- 本阶段回执：`docs/wi-t1000001/implementation-report.md`。
- 任务 T01 未声明独立交付产物（`artifactPaths` 为空，`implementation-report.json` 为 `required:false`），故未生成任务级报告文件。