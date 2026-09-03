# Agent Note: /init 升级为内置宿主命令

Status: implemented

[English](2026-08-31-lx-init-built-in-command.md) | 中文

## 问题

`/init` 以 loose preset 行的方式指向 `~/.dsh/plugins/lxcode-init/index.js`,命令只存在于同时带着该文件与该 preset 行的机器上。部署里其他人的命令(compact、goal、export)都是 harness 树里的一等包。

## 决策

**把命令提升为 harness 包 `@deepseek-ai/dsh-command-init`,挂在 web bundle 的宿主平面。**

- 包位于 `packages/context/command-init`,与 `agent-instructions`(消费草稿文件的加载器)同组,沿用 `command-compact` 模板:`name`/`inject = ['commands']` 导出、经 `ctx.effect` 注册的 `apply`、以及 invariant 伴随件。
- 处理器保持只引导的约定:取 `agent.session.header.cwd`,检查是否已有 `AGENTS.md`,引导一条用户消息(起草或改进提示,可选追加用户补充关注点)。命令自身永不写文件;写入走 agent 的方案先行纪律。
- web bundle 的 `cordis.patch.yml` 在宿主行插入 `command-init`,所有组合出的 preset——不只是 LxCode preset——都能发现 `/init`;`web-app/package.json` 与 `tsconfig.host.json` 承载对应的注册面。
- 用户侧 loose 行退役:LxCode preset 不再引用 `~/.dsh/plugins/lxcode-init`(注册器对重名命令抛错,两行本就无法共存)。

## 考虑过的替代方案

**由 `dsh-agent-instructions` 自己注册命令。** 加载器包拥有 AGENTS.md 的读取语义,把写入侧提示词也放在那里内聚性强,`ctx.inject(['commands'])` 子项在没有注册表时也会保持不激活。被否:`dsh-commands` 会成为每个组合都挂载的 context 包的 peer 依赖——包括没有命令平面的 providerless/ACP 树;独立命令包以相同的注册面组合,对这些树零成本,且沿用 `command-compact` 的先例。

**保留用户侧 preset 行。** harness 树零改动,但命令只会存在于带 `~/.dsh/plugins/lxcode-init/index.js` 的机器上——全新安装没有 `/init`,且注册器的重名防护使内置行与 loose 行在迁移期间无法共存。

## 结果

`/init` 在任何 LX-DSH 安装(dev 与打包)开箱可用,无需用户目录配置;组合该 web bundle 的其他 preset 也获得它。行为与 loose 插件完全一致:相同提示、相同结果文本、相同的写入前确认流程。测试锁定注册面(Loader 安全导出、dispose)、四个处理器分支、命令生命周期事件对,以及端到端发现并执行该命令的真实 Loader 组合。
