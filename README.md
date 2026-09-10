# 任务看板 (Task Board)

一个轻量级的单页任务管理应用，使用 Kanban 看板视图管理个人任务。纯前端，零外部依赖。

## 功能

- **看板视图** — 三列（待办 / 进行中 / 已完成）看板
- **创建任务** — 点击"+"或按 `n` 键快速创建
- **拖拽排序** — 鼠标拖拽 + 触摸适配
- **内联编辑** — 双击卡片编辑标题、描述、优先级和截止日期
- **删除与撤销** — 删除后 5 秒内可撤销
- **搜索筛选** — 实时搜索（300ms 防抖）
- **列可见性** — 显示/隐藏任意列
- **深色模式** — 切换并持久化偏好
- **JSON 导出** — 一键导出全部任务数据
- **数据持久化** — localStorage 存储，刷新不丢失

## 技术栈

- Vanilla JavaScript（无框架依赖）
- HTML5 Drag & Drop API + Touch 适配
- CSS 自定义属性实现双主题
- localStorage 版本化 JSON 持久化

## 使用

直接用浏览器打开 `app/index.html`，或用任意静态服务器托管 `app/` 目录：

```bash
npx serve app
```

## 项目结构

```
app/
├── index.html    # 页面骨架
├── style.css     # 样式（Light/Dark 双主题）
├── store.js      # 数据持久层（CRUD + localStorage + 错误恢复）
└── app.js        # UI 渲染与交互层
```