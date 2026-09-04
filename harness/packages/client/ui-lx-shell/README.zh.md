# @deepseek-ai/dsh-client-ui-lx-shell

[English](README.md) | 中文

LX-DSH 桌面壳的客户端插件：品牌行、更新按钮与弹窗、窗口 chrome、以及快问快答抽屉。所有注册以 `window.lx` 桥存在为前提——在纯浏览器中插件完全惰性。

## Model Experience

**零模型影响。** 本包只注册 UI 表面。不添加工具、提示词或上下文，无 token 成本。在 LX-DSH 壳之外一切惰性（什么都不渲染）。

### KV cache

无模型可见表面；无缓存贡献。

## Architecture

- **品牌行**（`sidebar.brand.mark` / `sidebar.brand.name` 槽位）：`LxSidebarVersion` 显示 `v{appVersion}`（IPC `lx:appVersion`），rail 状态自动隐藏；`LxUpdateButton`（绿色 pill）在其右侧，点击打开更新弹窗。
- **窗口 chrome**（`conversation.session.header.utilities` 槽位）：`LxHeaderChrome` 渲染最小化/最大化/关闭，并在挂载时向拥有它的 `<header>` 打 `data-lx-drag` 标记（`drag.css` 应用 `-webkit-app-region: drag`；交互子元素 no-drag）。
- **更新体系**：`LxUpdateButton` + 弹窗显示当前/新版本行、changelog（缺失显示「未提供更新日志」）、实时下载进度与立即安装/稍后按钮；`LxUpdateStatus` store 镜像宿主更新状态（dev 模式 `LX_DSH_FAKE_UPDATE=1` 伪造可用更新做界面验证）。
- **快问快答抽屉**（`shell.overlay` 槽位 + `sidebar.footer.action` ⚡ 入口）：`LxQuickButton`（`aria-pressed` 镜像抽屉状态）与 `LxQuickDrawer`——420px 左锚定收缩面板，承载针对 `quick-answers` 预设的紧凑问答交流（会话经 `sessions.create` 建立，从不设为 current）。回答走共享的 `MarkdownText` 管线；思考过程走同一 Think 折叠行。抽屉壳两种状态都保持挂载：面板右侧的边缘把手切换收缩，收起时面板滑出屏幕、把手停靠在左缘（面板体移出无障碍树，滚动与草稿状态保留）。根声明 `-webkit-app-region: no-drag`（覆盖在 Session Header 拖拽条上）。`quick-store.ts`（`createQuickDrawerStore`）持有 open 标志、绑定会话 id、turns 与错误。
- **作用域纪律**：一个 store handle 只挂一个 seat——chromeStore（updater 镜像）由 `sidebar.brand.name` 持有；快问 store 由 `shell.overlay` 持有；`conversation.session.header.utilities` 是会话作用域（另一 store 实例）。

桥在 Cordis 拓扑之外，因此没有服务缝：订阅是 apply 体持有的普通函数，随插件 fiber 一起销毁。

## Known Limitations and Deferred Work

- 更新 UI 的宿主状态只在打包构建里真实（dev 模式 updater 为 no-op，用伪造开关预览）。
- 快问抽屉一次一个线程；工具调用进度行留作打磨。
