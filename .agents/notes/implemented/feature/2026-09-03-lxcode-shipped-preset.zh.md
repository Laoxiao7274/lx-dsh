# Agent Note: LxCode 作为自带插件的出厂预设

Status: implemented

## 问题

LxCode 的 Agent 组装此前只存在于用户本机预设
`$DSH_HOME/.agent-presets/lxcode`，其两个记忆插件（`lxcode-memory`、
`lxcode-session-search`）以绝对路径引用 `~/.dsh/plugins/` 下的文件。全新
机器和其他 LX-DSH 用户什么都得不到；跨会话 `session_search` 还额外依赖
用户的根级 patch 启用 `session-query-sqlite`——出厂 web profile 默认是
内存临时索引且 `openAt: never`，即使复制预设也搜不到任何东西。

## 决策

把预置随 `dsh-agent-presets` 的出厂根发布（`presets/lxcode/`），roster
会将出厂根前置为 system-trusted 集合：

- 两个插件**随预设目录携带**（`presets/lxcode/plugins/{memory,
  session-search}/index.js`），组装用**相对 specifier** 引用
  （`./plugins/memory/index.js`）。`classifyRowSpecifier` 本就把该形态作为
  一等公民——discovery 健康检查与 mount 导入都相对预设自身目录解析——
  组装因此自洽：无绝对路径、无 workspace 包、无闭包条目，出厂包的
  `files` 本就携带 `presets`。
- `session-query-sqlite` 对 web 面默认开启：web-app bundle patch 改为
  home 相对的持久路径 + `openAt: first-search`。启动保持安静（SQLite
  打开推迟到首次搜索），且每个预设的 Agent——不只是 LxCode——都能读
  `ctx.sessionQuery`。出厂行为仍可通过后续 patch 层覆盖（该行文档化的
  覆盖缝）。
- 展示文案沿用出厂预设模式：`ui-agent-preset` 的
  `presetLxcodeName` / `presetLxcodeDescription` locale 键，
  在 `dsh-agent-presets/display` 中与其余五个预设并列映射。

## 考虑过的替代方案

- **把两个插件 vendor 成 `plugins/` 工作区包**（dsh-web-search 路线）。
  否决：预设的插件是其组装的一部分——preset-relative 是受支持的一等
  机制，无需 workspace/deploy 簿记，且保持预设可复制（roster 的复制流
  复制整个目录，插件包含在内）。
- **预设保持用户自建、仅文档化。** 否决：产品发布一个品牌化模式，全新
  安装应能在选择器中直接选用并带着能用的记忆与搜索。

## 后果

- 全新机器在选择器中与其它出厂预设并列列出 `lxcode`（system-trusted、
  受重复保护：占用该 id 的用户目录被出厂版遮蔽，既有本地副本原位升级）。
- `session_search` 全新安装开箱可用；持久索引文件在首次搜索后出现在
  harness home 下。想要回出厂内存索引的部署在后续 patch 层覆盖该行。
- 出厂文件中的 LxCode persona 与 plan-mode 段落是产品文案；用户改动应
  复制出预设，而不是改出厂目录（升级会替换它）。

[English](./2026-09-03-lxcode-shipped-preset.md) | 中文
