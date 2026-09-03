# Agent Note: 会话头「在编辑器中打开」按钮

Status: implemented

[English](2026-08-31-lx-shell-open-in-editor.md) | 中文

## 问题

会话头的窗口 chrome(ui-lx-shell)没有从会话到磁盘项目目录的通路:用户要打开仓库只能离开应用。

## 决策

**在会话头 chrome 条加一个「在 VS Code 中打开」图标按钮,由 LX-DSH preload 桥新增的 `editor` 面支撑。**

- `lx-dsh/preload/index.ts` 经新增的 `lx:openEditor` IPC 暴露 `lx.editor.open(cwd)`;`lx-dsh/electron/main.ts` 用 `shell.openExternal('vscode://file/<cwd>')`(反斜杠归一、路径按 URI 编码)处理,返回 `{ ok, error? }`。VS Code URL 协议已在目标机器实测可打开文件夹。
- `ui-lx-shell` 的 `LxShellBridge` 增加可选 `editor` 成员(与 `appVersion` 同款可选成员模式);`readBridge` 只在运行中的壳提供该面时才命名它,因此旧壳与纯浏览器宿主里按钮保持隐藏。
- `LxHeaderChrome` 通过标准 `useSessions` share(`ConversationRoot` 同款)读取会话 `cwd`,在插件管理按钮旁渲染 `</>` 图标按钮,会话无工作目录时禁用。协议处理失败在壳层呈现后吞掉;按钮不携带忙碌态。

## 考虑过的替代方案

**在 web UI 里直接放 `vscode://` 链接。** dsh web 客户端可以渲染使用编辑器 URL 协议的锚点,但浏览器托管的页面触发自定义协议处理会弹出确认且不可靠;而编辑器选择(VS Code/Cursor/explorer)是桌面壳的知识,不应由 web 客户端持有。

**从壳层 spawn 编辑器可执行文件。** 按平台解析 `code`/`cursor` 可执行文件及其 PATH 变体会重复编辑器自身 URL 协议已经解决的问题,维护成本更高且没有回退收益。

## 结果

一次点击即可从会话进入 VS Code 里的仓库。没有编辑器桥或未装 VS Code 的宿主退化为隐藏或不可点的按钮。cwd 来源是会话管理器的实时列表,工作区尚未加载的会话会先显示禁用按钮,解析后恢复。

已知遗留:`LxUpdateButton.tsx` 两个预存 `no-unnecessary-condition`(不在本次范围);`test:web` replay 的 golden 在该 lane 预存红修好后可能需要吸收这个新头部按钮。
