# Agent Note: 产物预览 —— 分类产物行与标签页面板

Status: implemented

## 问题

一轮的已产出文件只能显示为名字 chips，点击后交给系统默认应用。agent 产出的图片、视频、音频和 HTML 无法在应用内查看，而混在一行的 chips 没有视觉分组与排序。

## 决策

以一个宿主 Remote 方法加一个客户端插件包交付应用内产物预览，两个表面通过既有的产物 turn 投影连接。

`session/readWorkspaceFile`（packages/api/session-controller）按调用方选择的交付形式读取一个 Session 工作区文件：`text` 返回整文件 UTF-8，`bytes` 返回整文件 base64 + 按扩展名推导的 media type。字节上限是部署 Config（`textReadCapBytes` 默认 2 MiB；`bytesReadCapBytes` 默认 32 MiB）。失败带稳定错误码 `session/file-not-found` 与 `session/file-too-large`；既有的 `workspace/*` 错误码属于 Workspace Controller 且声明 `{workspaceId}` details，因此 session 域用自己的文件错误码。信任模型沿用 `openWorkspacePath` —— 它已经把客户端解析的工作区路径交给宿主。

`ui-artifact-preview`（packages/client）渲染两道产物行（媒体道 视频 > 图片 > 音频，暗底卡片 + 缓存的图片缩略图；文件道 网页 > 文档 > 数据 > 代码 > 二进制，紧凑 chips），以 priority -100 注册进 `conversation.chat.turnTail` 链，在两包同时组合时遮蔽官方 `ui-deliverables` chips 行。点击任一卡片在 `shell.overlay` 面板中打开该产物：自带标签条（打开/聚焦/关闭；关闭活动页落到右侧邻居；全关出空态）、工具条（重读、系统打开、关闭）、按类型路由的内容体（MarkdownText、CodeBlock、JSON 美化、手写 RFC 4180 CSV 表格、棋盘底图片、blob URL 的视频/音频暗舞台、`sandbox="allow-scripts"` iframe 的 HTML、二进制回退到复制路径）和状态行。面板通过组件内 effect 按 open 标志给页面 body 留出等宽空隙。

支撑该形态的接缝选择：

- 链选举（`ui-slots` ChainSelect：priority 升序、首个非空胜出）是替换官方行的正规途径；把本插件移出 cordis.yml 即恢复 deliverables chips，无需其他改动。
- 字节经既有 Remote 线路以 base64 到浏览器并转 `URL.createObjectURL` blob URL，沿用 `HistoricalImageCache`（附件图片路径）：不新增静态文件路由，不新增 webserver 鉴权面。
- apply 侧的 store 写走面板注册的 bound actions（inject 工厂内 `bound = actions`，即 ui-lx-shell 的 `todoBound` 模式），因为框架持有 store 实例；apply 从不对已注册 handle 调 `.create()`。读去重是 apply 侧的已启动 tab key `Set`。
- 图片缩略图放在 `createSnapshotStore` observable 里，经行注册的 `hooks` 通道传递，行组件以绑定的 `useThumbnails` selector hook 读取（ProducedFiles 的 `workspacePathOpen` 模式），不做轮询。
- 零新增第三方依赖：文本渲染复用 ui-primitives（`MarkdownText` micromark GFM+math、`CodeBlock` shiki，复制标签从 locale 穿透）；CSV 解析是包内约 50 行 RFC 4180。

## 考虑过的替代方案

- 宿主静态文件 HTTP 路由（外部 `dsh-artifact-preview` 插件的 `/dsh-files/static` 路线）为媒体与 iframe 提供工作区文件：v1 拒绝 —— 它新增 webserver 鉴权面与第二条内容路径；整文件 base64 读取匹配既有附件线路且覆盖当前全部产物形态。若范围流式媒体或 HTML 相对资源成为需求，路由是自然的升级位。
- 独立 Typert Remote 命名空间由新宿主包持有：拒绝 —— 该读取正是像 `openWorkspacePath` 一样的 Session 工作区路径操作，后者已在 session 命名空间上；在那儿加一个方法不需要新命名空间注册或包接线。
- 复用右侧 details 列（第四个 details 标签）替代 overlay 面板：拒绝 —— 已认可的设计是带自己标签条的持久并排预览，共享的 details 列无法在不嵌套标签的情况下承载。
- 在 `ui-deliverables` 内渲染该行：拒绝 —— 特性必须整体可移除；链优先级在本包组合时遮蔽官方行，移除即还原。

## 后果

- `RemoteErrorDetailsMap` 新增 `session/file-not-found` 与 `session/file-too-large`；session-controller 测试里的 fake session remote 与 test-remote 面都长出了该方法。
- 客户端聚合 tsconfig、web-app cordis.patch.yml、web-app package.json 各带新包行（三处必需的注册面）。
- 宿主 tsc 面暴露两个潜伏缺陷并顺手修复：ui-workspace apply spec 用 lib 打包与源码组件做身份比较（改为源码相对导入，即 ui-lx-shell spec 模式）；ui-lx-shell 的 tsconfig 缺其 todos 行所需的 ui-workspace 项目引用。`WorkspaceGroupRowOwnerProps.workspaceId` 放宽为普通 `string`（槽位 owner props 是边界数据；GroupNode 不带 branded id）。
- 已推迟（记录在包 README）：网页视图的 localhost 端口 chips（需要宿主回环监听枚举 Remote）、预览 HTML 内的相对资源、以及媒体的范围流式读取。

测试：`session-read-workspace-file.host.spec.ts` 覆盖 Remote（text/base64/上限/缺失/中止）；包内 spec 覆盖分类排序、store 标签语义、行与面板渲染、apply 接线（链选举、cwd 解析、读沉降、缩略图发布）；门禁跑的是 `pnpm run test:gui` 与完整 `pnpm run build`。
