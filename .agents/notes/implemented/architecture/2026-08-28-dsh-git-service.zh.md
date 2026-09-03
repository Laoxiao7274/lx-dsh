# Agent Note：dsh-git 把系统 git 收进一个 JSON-safe 服务，供客户端面板使用

Status: implemented

[English](2026-08-28-dsh-git-service.md) | 中文

## 问题

LX-DSH 客户端要加 IDE 式右栏（项目文件树、Git 变更与暂存提交、高亮 diff——设计原型见
`opendesign/prototype-git-panel.html`）。宿主侧没有任何 git 能力：agent 只通过 shell
工具触达仓库，浏览器无法调用；UI 面板需要 JSON-safe 投影与判别式失败（非 git 仓库、
路径缺失、索引为空），而不是 CLI 退出码。

## 决定

新建能力包 `@deepseek-ai/dsh-git`：`GitService` 经 `simple-git` 执行系统 git
（spawn 用户安装的二进制，投影与终端输出一致），每次调用携带一个工作区目录——
`status`、`diff`、`log`、`stage`、`unstage`、`discard`、`commit`、`listDir`、
`readFile`。所有失败以 `error.git` 携带判别式 `GitError`
（`not-a-repo` / `no-such-path` / `nothing-to-commit` / `git-failed`）抛出，由传输层
序列化；面板据此渲染三种有意义状态（非 git 仓库提示、干净工作区、路径缺失）。

三个实证确定的实现事实：

- `simple-git` 默认 `status()` 不含 commit hash——HEAD 用 `revparse('HEAD')` 取
  （unborn 分支 catch 为 null）；带字母的分区数据源是 `state.files`
  （`index`/`working_dir` 字母，`?` = untracked），不是便捷字符串数组。
- 路径包含检查用 `path.relative`（前缀字符串比较在 Windows 反斜杠上必然失效），
  工作区根自身是合法输入（空相对结果不是逃逸）。
- `readFile` 把 CRLF 归一化为 LF：Windows checkout 按 `core.autocrlf` 写平台换行，
  内联代码视图渲染归一化文本，不改动工作区字节。

服务对模型不可见（无 session 事件、无持久状态、无 token 消耗），且有意不含传输层：
Connection RPC 通道连同其载荷 schema 与信任策略随客户端面板接线落地；本次只交付
领域逻辑与行为测试。

## 考虑过的替代方案

**isomorphic-git（纯 JS，不依赖系统 git）。** 不依赖用户安装的 git、跨机器行为一致，但其 status/porcelain 语义与终端 git 有漂移——面板会显示与用户自己 CLI 矛盾的 diff；且为了零 JSON-safe 收益（服务边界已把一切转成类型化投影），它以可观的重量重新实现对象库与过滤器。

**直接 spawn `git` CLI 解析 `--porcelain`。** 去掉 simple-git 依赖，但要重新拥有 argv 引用、Windows 路径引用、退出码分类与流捕获——这些 simple-git 都已处理；实证陷阱（status 字母、unborn 分支的 revparse）依旧存在，还要手工解析。

## 后果

- 面板数据层无需传输即可测试：测试通过系统 git 驱动真实临时仓库。
- simple-git 的 porcelain 形状被约束在单文件内；传输序列化的是 `src/wire.ts` 的
  wire 类型，替换或新增通道不会泄漏解析细节。
- 对未跟踪路径的 discard 会从磁盘删除文件（checkout 拒绝它们）；面板调用前必须确认。

## Verification

`packages/git/git/tests/git-service.host.spec.ts` 驱动真实临时仓库：干净树状态、
暂存/未暂存/未跟踪分区、stage-commit-log（断言作者与主题）、空索引与空消息拒绝、
unified diff 内容、对已跟踪修改与未跟踪文件的 discard、树状态注解与目录优先排序、
受保护的文件读取（缺失路径、ENOENT 归类）、普通目录的 `not-a-repo` 分类。
