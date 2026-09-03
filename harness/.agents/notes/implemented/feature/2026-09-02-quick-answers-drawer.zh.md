# Agent Note：快问快答抽屉

Status: implemented

[English](2026-09-02-quick-answers-drawer.md) | 中文

## 问题

「快问一下」需要一个不付出上下文切换代价的容身之处。在 LX-DSH 里问一个快问题，要么打进出主对话——用即弃的搜索问题污染正在工作的会话——要么离开应用去搜索引擎。该功能的第一版用独立弹窗 BrowserWindow 解决，但那为一个「快问一下」开了第二个应用实例：独立进程、任务栏条目、localStorage 分区——而主窗口的对话就在旁边。

## 决策

- **快问交流是主窗口内的右侧锚定抽屉**——侧栏底部 ⚡ 入口切换的滑入面板（420px、l2 浮层），承载针对 `quick-answers` 预设（搜索先行、附来源、即问即弃）的紧凑问答交流。纯客户端插件工作：完全不需要 Electron 侧代码。
- **抽屉是后台会话消费者，不是舞台。** 首次展开建会话（`sessions.create` 带 `agentPreset: 'quick-answers'`）、开事件窗口、订阅 `binding.eventSource`；`ask` 以 queue 模式发 prompt；reset 归档会话并另铸新的。快问会话从不设为 current——主窗口的选择不受影响。`SessionFace` 增 `open()`——会话事件窗口的幂等首次打开——因为此前窗口只随 staging（`followCurrent`）打开，后台消费者没有正当入口（test-support 的 `FixtureSession` 带 fail-loud stub）。
- **呈现与主聊天一致。** 回答经共享的 `MarkdownText` 管线渲染，思考过程走同一个 Think 折叠行（DisclosureRow + IconThinkOutline14 + useStreamReveal——收起摘要流式、展开自动跟随），工具调用显示为安静的 chip（搜索图标 + 工具名，turn 运行中带点点）。`deriveQuickTurns` 每次发布从完整事件窗口全量重投影——`user` 来源的 `user/message` 开轮；`assistant/chunk` 的 text-delta 累进 `answer`、reasoning-delta 累进 `reasoning`；`tool/call` 追加工具 chip；`assistant/message` 定稿；快照的 `running` 标记尾部；注入上下文（plugin 来源）不进轮。

## 组成

- `packages/client/ui-lx-shell` 拥有整个功能：`LxQuickButton`（sidebar.footer.action；`aria-pressed` 镜像抽屉状态，inject 接收 `toggle(open)`）、`LxQuickDrawer`（shell.overlay：头部 + 交流列表 + 输入框；Enter 发送、Shift+Enter 换行；抽屉根声明 `-webkit-app-region: no-drag`——它覆盖在 Session Header 的窗口拖拽条上，不显式声明时 Chromium 的 app-region 命中测试会让底下的 `drag` 区域继续吞掉头部按钮的 hover 与点击；输入区把发送按钮相对输入框盒子垂直居中，两者读作一个对齐单元；滚动列表把滚动条 thumb 重绑到 l2 浮层 token——设置面板先例——中性实线边框与分隔线保持 0.5px 发丝线，elevation-style 门禁）、`quick-store.ts`（`createQuickDrawerStore`：open 标志、绑定会话 id、turns、错误；组件绑定的实例是唯一写入目标，apply 侧逻辑走捕获的 `BoundActions`）与 apply 体。
- 注册：不需要新包——`ui-lx-shell` 已在 web-app 组合里（增加了 `sessions`/`workspaces` 服务 inject 与 `shell.overlay` 槽类型所需的 `dsh-client-ui-layout` devDep）。`ui-quick-answers` 包（#quick 哈希引导）连同注册三件套删除；`sessions.create` 的 `agentPreset` 透传保留。
- Electron（lx-dsh）：弹窗窗口、其 IPC、preload 桥成员与菜单条目已移除（回到弹窗之前）。窗口控制作用于调用窗口的修复保留。

## 考虑过的替代方案

**保留弹窗窗口。** 独立 BrowserWindow 把交流完全隔离。否决：它为一个本质上是「侧眼一瞥」的需求复制了整个应用（进程、任务栏条目、localStorage 分区），还需要抽屉完全不需要的 Electron 侧管线。

**用轻量预设复用主对话。** 对当前会话以快问快答组合发 prompt 不需要新会话。否决：它用即问即弃的交流污染工作会话的日志，并把快问的生命周期耦合到工作区会话上。

## 后果

一击即在主对话旁打开有据可查的问答交流；其会话是普通的持久会话（reset 时归档），主窗口的选择从不受影响。已知限制：一个抽屉一个线程——切换工作区不关闭它（快问会话按构造无工作区）；预设的搜索活动只显示运行点点（工具调用进度行留作打磨）；轮次历史只随事件窗口的尾页（抽屉从不分页更早的轮次）。验证：ui-lx-shell 规范（38 测试——按钮、抽屉交互、轮次投影、apply 接线）、test:gui 293 文件 / 3988 绿、client + host tsc 0，以及 dev 实例的 CDP 端到端（点击 → 抽屉 → 两个真实问题、流式带链接渲染的回答）。
