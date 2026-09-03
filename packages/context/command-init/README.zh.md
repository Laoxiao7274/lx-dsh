# @deepseek-ai/dsh-command-init

[English](README.md) | 中文

面向人的 `/init` 项目指令命令。插件经 [`ctx.commands`](../../interaction/commands/README.zh.md) 注册一条全局命令,引导接收 agent 分析当前项目并起草——或在已存在时改进——其 `AGENTS.md`,随后由 [agent-instructions 加载器](../agent-instructions/README.zh.md) 注入该项目打开的每个会话。

## 命令约定

| 输入 | 结果 |
|---|---|
| `/init`(无 `AGENTS.md`) | 引导只读分析后按标准六段结构出完整草稿;成功文本:`Analyzing the project to draft AGENTS.md — a draft will be presented for your confirmation.` |
| `/init`(已有 `AGENTS.md`) | 引导对照同一结构查缺口并出保留仍成立内容的完整替换稿;成功文本:`Analyzing the project to improve AGENTS.md — a draft will be presented for your confirmation.` |
| `/init <补充关注点>` | 在引导文本末尾追加 `用户补充关注点:<输入>`。 |
| 会话无 cwd | `No working directory available for /init.` — 不做任何引导。 |

处理器只经 `agent.steer` 引导一条用户消息,不写文件。分析、草稿与最终的 `AGENTS.md` 写入都走 agent 的常规纪律——只读探索、方案先行、写入前等用户确认。每次已决调用记录执行器持有的仅日志事件对 `command/run` / `command/done`;两者都不进入模型历史,而被引导的提示成为普通会话输入。

## 组合

生产者只注入 `commands`:

```yaml
- id: commands
  name: '@deepseek-ai/dsh-commands'
- id: command-init
  name: '@deepseek-ai/dsh-command-init'
```

LX-DSH Web bundle 在宿主平面挂载它,所有组合出的 preset 都能发现 `/init`;其他部署按各自组合自行启用。

## 模型体验

### 人的 `/init` 控制

#### 模型看到什么

斜杠输入与直接结果不进入模型请求。被引导的分析提示作为一条普通用户消息进入;草拟的 `AGENTS.md` 文本在会话中呈现并等确认后才写入。

#### token 影响

命令生命周期不增加模型 token。引导启动一轮分析轮次,规模随项目而定;确认后的 `AGENTS.md` 走 agent-instructions 加载器的字节预算。

#### KV 缓存影响

命令簿记不影响缓存。被引导的提示与同内容的用户输入完全一致地延伸会话。

## 已知限制与待办

- **只引导** — 命令自身不写 `AGENTS.md`;写路径留在 agent 的方案先行纪律里,被否决的草稿不触碰项目。
- **需要会话 cwd** — 无工作目录的会话得到直接错误;没有回退目录。
