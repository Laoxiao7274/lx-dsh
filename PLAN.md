# LX-DSH 设计方案（原生 UI 优先）

> 状态：M1 完成（2026-08-18）——原生 React 聊天 UI + 自绘标题栏全部跑通；M2（设置/凭据/导出/主题）待开始
> 日期：2026-08-18
> 项目位置：C:/Users/xzy/Desktop/my/DSH/lx-dsh
> 目标机器：Windows（Node 24 / npm 11 / pnpm 11 已就绪）

---

## 进度日志

### 2026-08-18 M0 完成（协议尖刀 + 桌面外壳）

- **wire-spike 全绿**（`npm run spike`，纯 Node 验证协议路径）：
  - dshRoot/node/contract 定位 ✅（dsh 0.1.0-rc.6）
  - spawn `dsh web --port 0` + 横幅端口解析 ✅（13.6s 就绪）
  - raw POST/WS 过信任栅栏 ✅（Node 不发 Origin → loopback 恒过，与 §2 #8 代码结论一致）
  - 运行时 import 契约包 ✅（AbstractApiClient + rpc/event schema 全部加载）
  - host.describe 10ms ✅；sessions.list / workspace.list 返回真实数据 ✅
  - 两条事件流 OPEN/CLOSE 干净 ✅；taskkill /t /f 进程树杀干净 ✅
- **Electron 外壳跑通**（`npm start` 或 electron.exe .）：
  - 主窗 LX-DSH（ui/index.html 状态页）：state/url/pid/dsh 版本、后端日志尾、双流帧计数、RPC 测试按钮（describe/sessions/workspaces）
  - DshBackend：banner → 握手（host.describe + 双流 open）→ running；崩溃退避重启 1s/3s/9s（×5）；退出杀进程树
  - IPC 桥：window.lx.api(domain, method) 类型化透传主进程客户端；backend:event/log/frame 事件下行
  - 单实例锁；原生菜单（重启后端 / 系统浏览器打开 / 复制 URL / DevTools）
  - 构建：esbuild → CJS（dist-electron/main.cjs + index.cjs）；electron 43.4.0
- **图标**（`npm run icon`）：纯 Node 生成 build/icon.png + icon.ico（靛→青渐变圆角 + 白色闪电）
- **环境备注**：
  - 本机远程/无 GPU 上下文下 GPU 进程即死（“GPU process isn’t usable. Goodbye.”）→ 默认 `app.disableHardwareAcceleration()` + `in-process-gpu`；有 GPU 的机器设 `LX_DSH_ENABLE_GPU=1` 恢复硬件加速
  - electron npm postinstall 未自动下载二进制（dist/ 缺失）→ `node node_modules/electron/install.js` 手动成功（ELECTRON_MIRROR=npmmirror 已配）
- **验证记录**：后端子进程 parent=electron ✅；127.0.0.1 自选端口 LISTENING + 2 条 ESTABLISHED（mux/host 双流）✅；外部探针 host.describe HTTP 200 ✅；与 3080 的既有 Web GUI 零冲突 ✅

**下一步 M1**：ui/ 换成 React + Vite + shadcn 原生聊天 UI（页面↔API 映射见 §5.3；启动页/会话列表/聊天流式/模型选择器/托盘）。

### 2026-08-18 M1 完成（原生 UI + 自绘顶部栏）

- **UI 落地**（`ui/` = Vite 6 + React 19 + Tailwind v4 + shadcn-radix，深色仪表台风格，Geist + JetBrains Mono）：
  - 自绘 frameless 标题栏：闪电品牌标 + LX-DSH 字标 + M1 徽章；telemetry 簇（状态点/端口/PID/模型，点击端口复制）；右侧 webview 一键切官方 SPA、重启后端、窗口控制（拖拽区 -webkit-app-region）
  - 侧边栏：workspace 折叠分组 + 会话行（运行中状态点/相对时间/重命名/归档）；新建会话走原生文件夹对话框（D5 拦截 host.pickDirectory）
  - 聊天流：事件折叠（user/context/assistant 块/tool 卡/turn 分隔线），markdown 渲染（表格/代码块/强调/链接），reasoning 折叠，usage/step 标签，seq 水印，流式光标；“加载更早消息”分页
  - 模型选择器（session.models 分组/efforts 子菜单）；composer（Enter 发送 / Shift+Enter 换行 / 运行中变 Stop）；启动页（telemetry + 后端日志尾 + 重启）；托盘 + 单实例 + Ctrl+Shift+Space
- **协议验证**（截图 + 日志双重确认）：host.describe / sessions.list / workspace.list / session.history（11709 事件 2.4MB，服务端 338ms，IPC 往返正常）/ session.models 全部跑通；mux/host 双流帧正常下行
- **踩坑与修复**（均有复现记录）：
  1. **stdout 背压冻结**：主进程 console.log 大量输出 + stdout 管道无人读 → Windows 同步管道写阻塞主进程事件循环（定时器全停，CPU 0）→ 引入 `electron/log.ts` 文件优先日志（%APPDATA%\LX-DSH\logs\app.log），stdout 只留状态级低频
  2. **capturePage 冻结**：本环境（无 GPU 上下文，in-process-gpu 软栅格）在后端未 ready 时截屏会冻住渲染进程 push-IPC（UI 卡启动页、窗口标题变 “Error”——是症状不是 bug）→ 调试截图改为 backend running 后 +10s/+40s 才触发
  3. **共享 DSH_HOME 竞态（R2 实锤）**：3080 服务器持有的会话 artifact 被周期写，LX-DSH 并发读 torn frame → “corrupt Zstandard session log” → openSession 对该类错误自动重试一次（2s）；不冲突的会话加载正常。长期解在 dsh 读端容错（截断尾帧丢弃），已记风险
  4. **unwrap 遗漏**：openHistoryWithRetry 重构时丢了 `unwrap(`，history 包络被当 value 用 → `res.events` undefined（截图比对 + 双侧 IPC 日志定位）
- **验证记录**：shotJ（running 后 t+41s，203KB）完整渲染 11709 事件会话：markdown 表格、reasoning 折叠、turn 分隔、pwsh 工具卡 DONE、seq 水印、模型选择器、侧边栏标题投影（“帮我卸载一下web ui插件”）✅；窗口标题 LX-DSH ✅；renderer 零报错 ✅
- **调试工具**（env 门控，保留）：`LX_DSH_SHOT=<png>` 截图探针 + `LX_DSH_OPEN=<sessionId>` 自动开会话；`ELECTRON_ENABLE_LOGGING=1` 看渲染端控制台

**下一步 M2**：设置/凭据/LLM 页、会话导出（原生保存对话框）、agentPreset、主题跟随、通知。

---

## 1. 背景与目标

dsh（@deepseek-ai/dsh 0.1.0-rc.6）目前只有两种形态：

- `dsh web`：本地 HTTP 服务 + 浏览器 SPA（本机的 Web GUI，默认 127.0.0.1:3080）；
- `dsh --profile tui / headless`：终端形态。

用户插件生态（dsh-web-ui-all：SSH / 任务看板 / 右侧面板，dsh-web-search，dsh-code-atlas）全部挂在 web profile 的浏览器 UI 上。

**目标**：做一个 Windows 桌面客户端 **LX-DSH（lx-dsh）**：

1. 桌面体验：独立窗口、托盘常驻、开机自启、单实例、全局快捷键、原生通知、崩溃自恢复、安装包 + 便携 exe；
2. **原生 UI 优先**（用户指定）：自研 React 界面覆盖核心功能（会话、聊天、设置、模型、任务）；
3. 后台复用现成 `dsh web` 进程，不重复实现 agent 运行时；
4. 为「包壳模式」留好退路：原生 UI 没覆盖到的插件功能，一键打开官方 Web 视图兜底（后续再改）。

---

## 2. 已验证的关键事实（本方案的地基）

以下全部在本机实际检查过，附证据位置：

| # | 事实 | 证据 |
|---|------|------|
| 1 | `dsh web` = `--profile web`，flag：`--host <127.0.0.1> --port <n>（0=OS 自选） --trusted-host <auth...>` | dsh/lib/bin.js；dsh-web-app/lib/startup.js |
| 2 | 默认绑定 127.0.0.1:3080（webserver 行：`port: ctx.webStartup.port ?? 3080`） | dsh-web-app/cordis.patch.yml |
| 3 | 启动就绪时 stdout 打印一行：`dsh web: http://127.0.0.1:<port>`（printUrl: true） | dsh-web-app/lib/index.js |
| 4 | 本机 3080 当前被正在运行的 Web GUI 占用 → 桌面端必须自选端口，不能硬绑 3080 | Test-NetConnection |
| 5 | 本机 web profile 是用户定制版，bundles：dsh-base / dsh-web-app / dsh-web-ui-all / dsh-web-search / modlens / dsh-code-atlas(file: tgz) | C:/Users/xzy/.dsh/profiles/web/package.json |
| 6 | wire 协议：unary = `POST /api/<method>`（JSON envelope，必须 application/json 否则 415）；回应服务端请求 = `POST /api/respond`；事件流 = 两条**只下行** WebSocket：`/api/events.mux`（会话级 MuxFrame）与 `/api/events.host`（主机级 HostFrame）；GET 访问这两条路径返回 426，无 SSE 兜底 | dsh-host-apiproxy README；dsh-client-connection README + lib/index.js |
| 7 | 就绪握手 = `host.describe` HTTP 成功 + 两条 WS 同时 open（generation 失效要整体重建并重新基线） | dsh-client-connection README |
| 8 | **信任栅栏（fence）代码结论**：Host 必须是 loopback 或 trustedHosts；`sec-fetch-site: cross-site` 直接拒；有 `Origin` 头时必须与 Host 同 host:port。**Node 客户端（不发 Origin/sec-fetch）经 loopback 恒过栅栏；任何异源浏览器（含 Electron renderer 从 file:// 或本地 UI 端口 fetch）会被 403** | dsh-client-connection/lib/index.js 的 isTrustedApiRequest() |
| 9 | 协议契约包 `@deepseek-ai/dsh-host-apiproxy` 是零 Node 依赖的 TS：`AbstractApiClient` 持有全部协议不变量（rpcId 铸造、四象限 envelope、zod 双层解析、unary 超时、envelope 观察），平台差异只剩 `doFetch` 一个抽象方法；它已随 dsh 安装在本机 dsh 包内 node_modules 里，可被运行时 import | lib/types/fetch/client.d.ts；dsh/node_modules/@deepseek-ai/dsh-host-apiproxy |
| 10 | 契约域方法全集（原生 UI 可直接调用的能力面）：sessions.{list,search,create,history,models,selectModel,rename,fork,prompt,attachment,updateQueue,cancel}、subagents.{list,history,prompt,interrupt}、host.{describe,pickDirectory,listDirectory,createDirectory,openPath}、workspace.{list,create,rename,delete,insertBefore,insertSessionBefore,archiveSession}、skills.list、agentPresets.{list,select,read,copy,openDocument,remove}、goals.{create,edit,pause,resume,complete,clear}、settings.*（describe 返回脱敏分层值+schema，update/replace/mutate 写用户层，revision 冲突检测）、credentials.*、llm.*、events.{mux,host} 等 | AbstractApiClient 的 IApiClient 声明 |
| 11 | 特权方法集（栅栏文档点名）：host.pickDirectory/openPath + settings/credentials 全平面 + agentPreset 作者平面——桌面端在 main 进程里代理这些方法，正好是加「用户确认」策略的收口点 | dsh-client-connection README |
| 12 | 会话日志导出是 host-only 下载面：`GET /api/session.export?sessionId=…` 流式 ZIP（HEAD 可预检）——桌面端可直接接到 Electron 原生「另存为」 | dsh-host-apiproxy README |
| 13 | dsh CLI 全局安装在 C:/Users/xzy/AppData/Roaming/npm（npm shim dsh.ps1/dsh.cmd），入口 lib/bin.js；用 `node <dshRoot>/lib/bin.js` 直跑可完全绕开 PowerShell shim | Get-Command dsh |

**结论**：桌面端 = Electron 外壳 + 自研 React 界面 + main 进程里的 dsh 协议客户端（Node fetch + WebSocket，恒过栅栏）+ 托管的 `dsh web` 子进程。**不需要改 dsh 一行代码。**

---

## 3. 技术选型

### 3.1 栈（已定，理由附后）

| 层 | 选择 | 理由 |
|----|------|------|
| 外壳 | **Electron**（最新稳定版） | dsh 是 Node CLI，main 进程直接 spawn 子进程、管生命周期最顺；Node 24 的 fetch/WebSocket 直接当协议传输；Windows 打包生态（electron-builder NSIS/portable）成熟。Tauri 体积更小，但需要 Rust 工具链、spawn/WS 客户端要自己写，且用户生态是 Node 系，排除。 |
| 渲染 UI | **React 19 + Vite + TypeScript** | 与现有插件 UI 同栈（dsh-web-frontend 即 Vite/React 产物），组件与经验可迁移。 |
| 组件/样式 | **Tailwind + shadcn/ui** | 用户已有 shadcn skill 与工作流；视觉与 Web GUI 可对齐（ui-theme 的 light/dark 偏好走 settings 域，后续同步）。 |
| 状态 | Zustand（轻）+ 事件流 reducer | 聊天区是事件流驱动（MuxFrame → 消息树），需要可预测的 reducer 而不是全局 store 乱飞。 |
| 打包 | electron-builder：NSIS 安装包 + 便携 exe | 个人/小团队分发首选；代码签名后续再说（自签名或裸包 + SmartScreen 提示）。 |
| 配置/日志 | 手写 config.json（%APPDATA%/lx-dsh）+ 滚动日志 | 避免引 electron-store 这类额外依赖，结构可控。 |

### 3.2 关键架构决策

**D1｜API 客户端放在 main 进程，renderer 不直连网络（由事实 #8 强制）**
renderer 只通过 preload 暴露的类型化 IPC（`window.dsh`）访问一切 dsh 能力。附带收益：
- 特权方法（#11）在 main 收口，可挂「用户确认/策略」；
- 连接重建（generation 失效）、重连基线（workspace.list / session.list 快照）集中在 main，UI 无感；
- 以后要改「包壳模式」（直接加载官方 SPA）不影响这套桥。

**D2｜协议契约运行时从已安装的 dsh 里加载，不在桌面端里钉版本**
`AbstractApiClient`、RpcMethodMap、zod schema 全部 `import()` 自 `<dshRoot>/node_modules/@deepseek-ai/dsh-host-apiproxy/lib/...`。
- 好处：dsh 升级后桌面端自动用同一套 wire 契约，不存在「客户端 rc.6 / 后端 rc.7」漂移；
- 代价：dsh 包内布局变化时需要更新解析路径 → 启动时做「契约探针」：加载后调用 `host.describe` 成功即通过，失败给出明确错误（见 §7 兼容策略）。

**D3｜后端 = 托管的 `dsh --profile web` 子进程，端口自选**
- 命令：`node <dshRoot>/lib/bin.js --profile web --host 127.0.0.1 --port 0`；
- 端口 0 → OS 自选，**解析 stdout 的 `dsh web: http://127.0.0.1:PORT` 横幅**拿真实端口（#3），彻底避开与现有 Web GUI（3080）的冲突；
- 备选策略（写入 config，默认 banner 解析）：固定端口 + 被占用时自动 +1 重试；
- 与浏览器 GUI 共享同一个 DSH_HOME（C:/Users/xzy/.dsh）：不同 session 并发没问题，**同一 session 不要两边同时打开**（见风险 R2）。

**D4｜双表面：原生 UI 为主，官方 Web 视图为兜底（用户说「包壳后续改」的落点）**
- 主窗口 = 原生 UI；
- 菜单/托盘一键「打开 Web 视图」：新开一个 BrowserWindow 直接 `loadURL(http://127.0.0.1:PORT)` —— 同源，栅栏天然通过，**全部插件功能（SSH/任务看板/右侧面板/code-atlas/网页搜索）零成本可用**；
- 后续路线：原生 UI 每覆盖一块，Web 视图就退后一步；最终是否收敛为纯原生由用户决定，架构上两种模式并存不冲突。

**D5｜原生增强拦截（小名单）**
main 的 IPC 桥默认透传所有 RPC 到后端；仅以下方法在桌面端本地实现（体验更好，且这些方法本来就是「驱动宿主桌面」的）：
- `host.pickDirectory` → Electron `dialog.showOpenDialog`（后端 native picker 在 Windows 上也要调系统对话框，绕一圈没意义）；
- `host.openPath` → `shell.openPath`；
- `GET /api/session.export` → main 流式下载 + 原生「另存为」；
- 其余全部透传（包括 settings/credentials 平面 —— 由后端统一写 C:/Users/xzy/.dsh，保证与 Web GUI 数据一致）。

---

## 4. 总体架构

```
┌────────────────────────────── lx-dsh.exe (Electron) ─────────────────────────────┐
│                                                                                        │
│  ┌─ Main 进程 (Node) ──────────────────────────────────────────────────────────────┐  │
│  │  AppCore      单实例锁 / 窗口 / 托盘 / 菜单 / 快捷键 / 通知 / 自启 / 窗口状态   │  │
│  │  Backend      spawn dsh web (port 0) → 解析横幅端口 → 健康探测 → 崩溃重启 →    │  │
│  │               优雅关闭 (taskkill /t 进程树) → 日志落盘                          │  │
│  │  ApiClient    class DesktopApiClient extends AbstractApiClient (运行时 import) │  │
│  │               ├─ doFetch = Node fetch → http://127.0.0.1:P/api/*（无 Origin，  │  │
│  │               │  恒过栅栏）                                                     │  │
│  │               ├─ events.mux/host = 两条 WebSocket (只下行) → AsyncIterable     │  │
│  │               └─ generation 重建 / 重连基线 / unary 超时 / respond 通道       │  │
│  │  IpcBridge    window.dsh.* 的类型化实现：api 透传 + D5 原生拦截 + 事件转发     │  │
│  │  ConfigStore  %APPDATA%/lx-dsh/config.json                                │  │
│  └──────────────────────────────────┬──────────────────────────────────────────────┘  │
│                                     │ contextBridge (preload)                          │
│  ┌─ Renderer（原生 UI, React+Vite）────────────────────────────────────────────────┐  │
│  │  启动页(后端状态) │ 会话/工作区 │ 聊天(流式) │ 设置/凭据/模型 │ 任务/目标/Jobs  │  │
│  └─────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────┬────────────────────────────────────────────────┘
                                        │ 子进程（stdio 管道）
                    ┌───────────────────▼────────────────────────────┐
                    │  dsh --profile web  (node, 127.0.0.1:自选端口) │
                    │  用户的 web profile：dsh-web-ui-all / modlens / │
                    │  dsh-web-search / dsh-code-atlas 全量在线       │
                    │  同一 DSH_HOME (C:/Users/xzy/.dsh)             │
                    └─────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────▼────────────────────────────┐
                    │  （可选）Web 视图窗口 loadURL 同一端口          │
                    │  = 官方 SPA + 全部插件，同源直连 /api           │
                    └─────────────────────────────────────────────────┘
```

---

## 5. 模块设计

### 5.1 main / electron 模块

| 文件 | 职责 | 要点 |
|------|------|------|
| `main.ts` | 应用入口 | 单实例锁（第二实例 → 聚焦主窗）；窗口状态记忆（bounds/最大化）；菜单与托盘（§6）；退出流程（停 UI → 停后端 → 落盘）。 |
| `backend.ts` | dsh 子进程托管 | ① 定位 dshRoot：config 覆盖 → `where dsh` → 已知 npm 全局目录；② spawn(nodePath, [bin.js, --profile, web, --host, 127.0.0.1, --port, 0])，env 继承 + 显式 DSH_HOME；③ 读 stdout 等横幅行（超时 60s，首启 profile 装依赖会更久 → 启动页显示实时日志尾）；④ 就绪 = 横幅解析成功 && host.describe OK && 两条 WS open；⑤ 异常退出 → 退避重启（1s/3s/9s，上限 5 次）→ 仍失败则 UI 显示错误页 + 日志；⑥ 关闭：先 SIGTERM，5s 未退则 taskkill /pid <p> /t /f（dsh 会拉 worker 线程/子进程，必须杀树）。 |
| `api-client.ts` | 协议客户端 | DesktopApiClient：doFetch → fetch(url, { headers: { 'content-type': 'application/json', ...init.headers } })（**绝不带 Origin**）；events.mux/host：覆盖 AbstractApiClient 的流实现，用 Node 24 原生 WebSocket 连 ws://127.0.0.1:P/api/events.*，按行解码 MuxFrame/HostFrame 喂 AsyncGenerator；generation 失效 → 断开两条 WS → 重新握手 → 通过 IpcBridge 发 connection:baseline-required 事件让 UI 重取快照。 |
| `ipc.ts` | IpcBridge | invoke 通道：dsh:api（域+方法+payload → 透传，D5 拦截表在此判定）；事件通道：dsh:mux / dsh:host（frame 原样转发）/ dsh:conn（状态机）/ dsh:backend（后端生命周期状态 + 日志行，供启动页/日志窗）；原生通道：dsh:pickDirectory、dsh:saveExport、dsh:notify、dsh:openPath、dsh:webview（开官方视图窗）。所有 payload 先过契约包的 zod schema 校验再下发/上行（客户端侧第二层解析）。 |
| `config.ts` | 配置 | { port: 0, dshRoot?, nodePath?, dshHome?, profile: "web", quitOnClose: false, launchAtStartup: false, globalShortcut: "Control+Shift+Space", lastBounds } → %APPDATA%/lx-dsh/config.json，热更新（自启/快捷键走 IPC 写回）。 |
| `log.ts` | 日志 | 后端 stdout/stderr → %APPDATA%/lx-dsh/logs/backend-YYYYMMDD.log（滚动，保留 7 天）+ 内存 ring（最近 200 行）→ 启动页/「查看日志」窗；桌面端自身 console → 同目录 app.log。 |

### 5.2 preload

`contextBridge.exposeInMainWorld('dsh', {...})`：只暴露 Promise/事件订阅两类面，不暴露 ipcRenderer 本身。类型（`dsh.d.ts`）由契约包的 RpcMethodMap **生成**（build 时脚本跑一遍类型投影），UI 里调用形如 `window.dsh.api.sessions.prompt(payload)`，全程强类型。

### 5.3 原生 UI 页面与 API 映射（P0 范围）

| 页面 | 用到的契约方法 / 事件 | 说明 |
|------|----------------------|------|
| 启动页 / 后端状态 | （IPC dsh:backend） | 横幅解析、host.describe、WS 握手三步进度条 + 实时日志尾；失败给「重试/查看日志/退出」。 |
| 工作区侧栏 | workspace.list + host 帧 workspace-changed / workspace-removed / workspace-order-changed；workspace.create({path})（D5 → 原生目录选择） | 目录即工作区，basename 标题。 |
| 会话列表 | session.list（重连基线）+ host 帧 session-added / session-status；workspace.archiveSession；session.rename | blank 会话按协议隐藏；标题走 projection 帧。 |
| 聊天主区 | 回填：session.history（分页，尾页带 projections 快照）；流式：mux 帧（assistant delta、tool 调用、turn/end、compaction/summary、command/run、session/title、session/queue、session/jobs…）；发送：session.prompt（含附件 session.attachment、clientTimeZone）；取消：session.cancel；队列编辑：session.updateQueue；fork：session.fork | 消息树渲染器参考 dsh-web-frontend 的节点类型但自研；工具调用先做通用折叠视图 + 高频工具（bash/pwsh/fs/read/edit/grep/glob/subagent/workflow/ask_user_question）专用卡片。 |
| 模型选择器 | session.models（current + provider 分组 + reasoning 元数据 + routable 标志）/ session.selectModel | 顶部下拉 + composer 内切换；不可用 provider 显示「请求更换」。 |
| 设置页 | settings.describe（脱敏分层值 + schema + revision + secrets 槽位）/ settings.update / replace / mutate（expectedRevision 冲突 → settings-conflict 弹合并提示）；credentials.*；llm.*（provider/模型目录） | 按 schema 动态渲染表单（schemastery schema 就是现成的渲染驱动）；密钥单向上行、界面永不回显。 |
| 会话导出 | GET /api/session.export（D5 → 原生另存为，HEAD 预检） | 会话右键菜单。 |
| Agent 预设 | agentPreset.list / select（P1：read/copy/remove 作者平面 + 打开目录） | 会话创建时的 preset 选择器。 |

**P1**：Jobs 面板（session/jobs 快照帧 + jobs 域）、Goal 条（goals 域 + goal 投影）、子代理（subagents.* 域：list/history/prompt/interrupt）、问题与审批交互（/api/respond 通道：ask_user_question 弹出原生对话框/通知 + 表单，审批策略 ask 时拦截确认）、skills/commands 面板（slash 菜单数据）、通知策略（turn/end、question 待答、job 结束 → 系统通知）。

**P2**：Web 视图一键兜底（D4，其实 P0 就能顺手做，成本极低）、会话全文搜索（session.search，依赖 web profile 打开 session-query）、自动更新（electron-updater + GitHub Releases 或本地目录）、多语言跟随 settings.locale、主题同步 ui-theme。

### 5.4 事件流 → UI 状态

main 的 IpcBridge 维护两个消费循环（mux/host 各一），把 frame 投到 IPC 事件；renderer 侧一个 useDshStream hook 把 frame 归约到「会话状态 store」（当前会话消息树、queue、jobs、projections 水线值：高 seq 赢）。generation 重建时 store 整体重置 + 重取基线（协议已定义重连基线语义，照做即可）。

---

## 6. 生命周期与桌面行为

- **启动**：主窗先出（启动页），后端后台起；横幅+握手 OK → 自动切换进主界面（同窗口换路由，不二次弹窗）。
- **关闭主窗**：默认**缩到托盘**（后端继续跑，会话不断）；托盘菜单「退出」才真正停后端。config quitOnClose 可切传统行为。
- **托盘**：图标带状态点（绿=运行/黄=启动中/红=失败）；菜单：显示/隐藏、打开 Web 视图、复制 URL、重启后端、查看日志、开机自启(勾)、退出。
- **全局快捷键**（默认 Ctrl+Shift+Space，可改）：切换主窗显隐。
- **通知**：P1 接入（agent 提问、turn 结束、后端崩溃重启）。
- **单实例**：第二实例启动 → 聚焦既有窗口并退出。
- **开机自启**：app.setLoginItemSettings（快捷方式级，不带 --as-admin）。

---

## 7. 兼容策略（dsh 版本漂移）

1. **运行时契约 import**（D2）：wire 类型永远来自当前安装的 dsh，不钉版本；
2. **启动探针**：dsh 版本（dsh -V）→ 契约加载成功 → host.describe 成功，三步任一失败给出带版本号的明确错误页；
3. **UI 侧能力探测**：host 帧/特权集有 describe 能力位（如 canOpenPath、authorable），按能力位渲染，而不是按方法存在性猜；
4. **最低支持版本**：0.1.0-rc.6（开发基线），低于它直接拒绝启动并提示升级 dsh（npm i -g @deepseek-ai/dsh）。

---

## 8. 打包与分发

- electron-builder：
  - LX-DSH Setup x.y.z.exe（NSIS，可选「开始菜单/桌面快捷方式」）；
  - LX-DSH-x.y.z-portable.exe（便携单文件目录）；
- 图标：scripts/make-icon.mjs 纯 Node 生成（256 PNG → 内嵌式 ICO，16~256 全尺寸）；图形：靛→青对角渐变圆角底 + 白色闪电（harness 意象），无外部依赖；
- **不捆绑 dsh 与 Node**（用户已全局安装；启动时探测，缺失则引导安装）——体积从 ~200MB 降到 ~90MB，且 dsh 升级零成本；后续可选「内嵌运行时」模式再说；
- 代码签名：v1 不做（SmartScreen 首次提示可接受），预留证书位。

---

## 9. 里程碑

| 里程碑 | 内容 | 验收 |
|--------|------|------|
| **M0 协议尖刀**（1~2 天） | Electron 骨架 + backend.ts（spawn/横幅/端口）+ DesktopApiClient（host.describe + 两条 WS + 一个 session.list 调用） | 终端里跑 main，打印出 host.describe 结果、mux 收到 host 帧；杀后端进程看到横幅重解析。 |
| **M1 聊天 MVP**（~3 天） | IpcBridge + preload + React 壳：启动页/会话列表/聊天（history 回填 + 流式渲染 + prompt + cancel）+ 模型选择器 + 托盘/单实例/快捷键 | 完成一次真实对话：看到流式输出、工具折叠卡片、模型切换生效；关窗到托盘、托盘退出干净杀进程树。 |
| **M2 设置与完善**（~3 天） | settings/credentials/llm 动态表单页、工作区管理、会话导出（原生另存为）、agentPreset 选择、主题/语言跟随、窗口状态记忆 | 在桌面端改默认模型/加 provider 凭据 → 新会话生效；导出 ZIP 可用；与 Web GUI 数据一致（同 DSH_HOME）。 |
| **M3 桌面能力 + 打包**（~2 天） | 通知（question/turn）、Web 视图兜底窗、开机自启、日志窗、NSIS + portable 出包 | 安装包装机可用；agent 提问时系统通知点击回会话；Web 视图里 SSH/任务看板插件正常。 |
| **M4 后续（按需）** | 自动更新、会话全文搜索、子代理面板原生版、多窗口多会话并排、内嵌运行时模式 | — |

总工作量估计：M0~M3 约 **8~10 个工作日**（单人）。

---

## 10. 风险与对策

| ID | 风险 | 等级 | 对策 |
|----|------|------|------|
| R1 | dsh rc 迭代快，dsh-host-apiproxy 内部布局/方法签名变化 | 中 | 运行时 import + 启动探针（§7）；M0 尖刀就是提前暴露这个问题；契约加载路径做成可配置 fallback 列表。 |
| R2 | 桌面端与浏览器 GUI 同 DSH_HOME：同一 session 两端并发打开可能写冲突 | 中 | v1 文档化「同一会话只在一端打开」；config 支持 dshHome 指向独立副本做完全隔离（代价：插件配置/凭据不共享）；后续可推动 dsh 侧加会话租约。 |
| R3 | Node WebSocket 客户端握手是否被栅栏接受（不发 Origin 才行） | 低 | 代码已确认「无 Origin → loopback 即过」；M0 第一步验证，若 undici 默认带 Origin 则显式删头。 |
| R4 | 进程树清理：dsh 子进程带 worker 线程/子进程，Windows 上 kill 不干净会残留占端口 | 中 | 退避 + taskkill /pid <p> /t /f 兜底；启动前探测横幅端口占用并提示「疑似残留，是否清理」。 |
| R5 | 内存：Electron(主+渲染) + dsh 后端 + agent 工作负载，重会话下可能 1~1.5GB | 低 | 窗口隐藏时 renderer 降频（webContents 休眠）；文档给出预期；后续可选 renderer 进程按窗口分治。 |
| R6 | 首启体验：profile 依赖缺失/装依赖慢（dsh-code-atlas 是 file: tgz） | 低 | 启动页实时日志尾 + 60s/180s 两级超时提示；本机 profile 已装好，风险主要在新机器。 |
| R7 | 特权面暴露：桌面端等于把 settings/credentials/agentPreset 作者平面交给自研 UI | 中 | 全部走后端统一实现（数据一致性 + 后端已有脱敏/revision 机制）；IpcBridge 对特权域加「二次确认」策略钩子（P1 落地），默认透传。 |
| R8 | Electron 下载 ~100MB，打包机需外网 | 低 | 本机可直连 npm；镜像源可配（ELECTRON_MIRROR）。 |

---

## 11. 目录结构（建仓时落地）

```
lx-dsh/
├── PLAN.md                  ← 本文档
├── package.json             workspaces: [electron, ui, shared]
├── electron/                main 进程 (ts, esbuild 打包)
│   ├── main.ts
│   ├── backend.ts
│   ├── api-client.ts
│   ├── ipc.ts
│   ├── config.ts
│   └── log.ts
├── preload/
│   ├── index.ts
│   └── gen-types.mjs        从契约包 RpcMethodMap 生成 dsh.d.ts
├── ui/                      renderer (Vite + React + TS + Tailwind + shadcn)
│   └── src/
│       ├── app/             壳/路由/主题/启动页
│       ├── chat/            消息树/工具卡片/composer
│       ├── sessions/        工作区与会话侧栏
│       ├── settings/        schema 驱动表单
│       ├── dsh/             window.dsh 类型化封装 + 流归约
│       └── components/      shadcn
├── scripts/
│   ├── make-icon.mjs
│   └── find-dsh.mjs         dshRoot/node 定位逻辑 (backend.ts 共用)
├── build/                   图标/安装包资源
└── docs/                    后续补充 (API 映射细表、UI 线框)
```

---

## 12. 开放问题（请拍板）

1. **产品名**：✅ LX-DSH（2026-08-18 已定：exe 名 LX-DSH.exe，仓库目录 lx-dsh）
2. **DSH_HOME**：默认与浏览器 GUI 共享（C:/Users/xzy/.dsh，数据互通、同会话勿双开）还是独立副本（完全隔离、配置不共享）？方案默认前者 + config 可切。
3. **M1 之后是否保留 Web 视图**：建议保留（插件兜底，成本≈0）；
4. **是否需要 macOS/Linux 支持**：方案按 Windows 优先写（进程树 kill、自启、NSIS），跨平台留接口；
5. **通知与快捷键默认值**：Ctrl+Shift+Space 切窗、question 待答系统通知 —— OK？
