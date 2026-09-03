# Agent Note: rewind 在 Typert remote 架构上的重放

Status: implemented

[English](2026-09-01-session-rewind-typert-replay.md) | 中文

## 问题

0.1.2-alpha.2 上游合并退役了 `dsh-host-apiproxy` 包(以及客户端 `dsh-client-runtime` 包),代之以生成的 Typert remote。LX-DSH 的 rewind 功能——用户消息上的「撤回到此」按钮,把持久日志截断回轮次边界——原先是经 apiproxy 的 `session.rewind` RPC 和 runtime manager 接线的,合并把它的宿主端点与客户端调用路径一并移除了。

## 决策

**跨生成的 remote 缝重放 rewind,不复活任何代理层。**

- 宿主早已拥有 rewind 的全部基座:`Session.rewind(atSeq)`(内存轮次截断)、`session/truncate` 持久化回调与持久截断、以及带 flush 检查点的 `SessionService.rewind(sessionId, atSeq)`。缺的只是线路暴露。
- 协议:`packages/api/session-controller/src/types.ts` 新增 `SessionRewindRequest`/`SessionRewindValue` 词汇与 `session/rewind-unavailable` 失败码;`commands.rewind` 在运行中的 agent 下拒绝并委派 `ctx.sessions.rewind`;`SessionController` 上的 `@Remote('rewind')` 方法让 typert 生成器为 `ctx.remote.session.rewind` 产出客户端契约。
- 客户端:`ISessions.rewind` 契约、`SessionManager.rewind`(调用 remote 后重同步常驻会话窗口)、以及服务层转发。
- UI:chat view 注册(现由 ui-chat 持有)注入 `rewindAt`;`ChatNodeOwnerProps` 把它带给键控的用户消息渲染器;`MessageIconActions` 重新获得带确认弹层的 rewind 按钮(chat 命名空间的 locale 键——该行已从 ui-conversation 迁至 ui-chat)。
- 草稿恢复:`rewindAt` 在截断把它从事件窗口抹掉之前,提取被撤回用户消息的文本块;rewind 成功后经 `conversation.input.for(actx).setDraft`(会话作用域的 `SessionInputResolver` 面)写回,提示词回到 composer 可编辑重发。

## 考虑过的替代方案

**为 rewind 复活一个轻量 apiproxy 式 RPC 通道。** 即保留一个客户端可直接调用的私有 `rpc.handle('/rewind')` 端点。被否:上游在合并中删除了整个 apiproxy 层,该通道要依赖的每一处接缝(线路契约解析、客户端传输)都已不存在;重建它的任何一部分都会重新分叉合并刚刚收敛掉的架构。

**以客户端侧重构实现 rewind**(在 UI 里丢弃尾部轮次并以重发来重放)。被否:持久日志才是权威——一个从不改写它的客户端截断会让每个恢复的会话和轨迹视图失同步,而重发会复制 token 而非削减它们。

## 结果

宿主端 rewind 遵循上游命令模式(`RemoteError` 错误码、agent-busy 拒绝)而非旧 apiproxy 处理器。被撤回的提示词经会话作用域的 `SessionInputResolver`(`conversation.input.for(actx).setDraft`)回到 composer 草稿——即初版延后的跨包草稿路径;只有文本块返回(图片在提交时已消耗)。测试 double 新增 `session.rewind` 记录,fake transport 返回 `{ accepted: true }`。
