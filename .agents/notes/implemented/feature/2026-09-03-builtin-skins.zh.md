# Agent Note: 主题 token 层之上的内置皮肤

Status: implemented

[English](2026-09-03-builtin-skins.md) | 中文

## 问题

Web GUI 只有一套视觉身份：中性的亮/暗调色板。想要不同观感的用户只能安装社区皮肤插件（外置 skin-center + 创意工坊生态）——它解决的是外部资产分发（安全、试穿、市场投递）这类树内功能不存在的问题，而真正的机制（基础调色板之上的 token 覆盖表）harness 内部已经建好了一半：`ThemeRuntime.overrideTokens` 接受逐 token 的 `{light, dark}` 成对值，`ThemePresenter` 把组合后的 token 投射到 `body`，持久化设置区只差一个字段。

## 决策

**皮肤作为树内 token 表，由现有 theme runtime 组合——没有新加载器、没有外部资产、没有任何 `ThemePresenter` 之外的 DOM 写入。**

- 持久化 `ui-theme` 设置区新增 `skin` 字段（默认 `default`；schema 用 `z.string()`，存储中的未知 id 在采纳时回落 `default`——注册表是编译期的，不是线路期的，schema 保持开放而采纳保持安全）。
- `ThemeRuntime.setSkin(id)` 是唯一的皮肤写入口；皮肤层在 `composeActive` 内组合，位于注册主题的 token 之上、seq 排序的 `overrideTokens` 覆盖层之下（包级覆盖按 token 胜过皮肤）。皮肤从不绑定配色方案：每个 token 携带两种调色板的取值，外观偏好始终是方案权威，亮暗切换会把同一套皮肤重组为另一调色板的取值。
- `src/skins.ts` 是注册表：`BUILTIN_SKINS`——`blue-fantasy`（靛蓝，改编自同名社区皮肤，scrim 算术解析为纯色）、`verdigris`（铜绿）、`midnight-ember`（余烬暖暗）。token 子集是安全核心（背景、边框、品牌、标签、交互、状态、侧栏面）；markdown/代码/滚动条 token 跟随组合后的调色板以保住代码块对比度。
- `SkinRow` 设置行（通用分区，色板卡片；圆点按 corner-shape 配对门禁带 `corner-shape: round`）以与外观、字号行相同的 store 镜像 + inject 面模式切换皮肤。
- 插件前引导脚本为解析后的方案写入活动皮肤的 token，与调色板和字号并列，因此刷新不会闪回无皮肤的默认值。

## 组成

- `packages/client/ui-theme/src/theme-settings.ts`——`SKIN_FIELD`、`DEFAULT_SKIN`、`ThemeSettings`/schema 的 `skin` 字段。
- `packages/client/ui-theme/src/skins.ts`——`BuiltinSkin` 类型与三张 token 表（新增）。
- `packages/client/ui-theme/src/client/index.ts`——`ThemeSnapshot.skin`、`setSkin`/采纳、`composeActive` 的皮肤层、`SkinRow` 注册。
- `packages/client/ui-theme/src/client/SkinRow.tsx` + `SkinRow.module.css` + `createSkinRowStore` + locale 键（新增）。
- `packages/client/ui-theme/src/boot-theme.ts`——引导脚本中的皮肤 token。
- `packages/client/ui-theme/src/index.ts`——导出；`readSection` 传递皮肤。

## 考虑过的替代方案

**安装社区 skin-center 插件。** 产品上否决：它解决的是树内皮肤不需要的外部资产分发问题（信任、试穿、市场），在 `ThemePresenter` 已经完成的工作之上加了一个 459 行的激活控制器，并让我们的观感耦合第三方发布节奏。

**把皮肤注册为独立主题（`ThemeRuntime.register`）。** 否决：把皮肤注册为主题会让皮肤与配色方案变成同一根轴（选了 "blue-fantasy-light" 再切暗色就丢了皮肤），每张表按方案翻倍而不是携带 `{light, dark}` 成对值。

## 后果

一个设置行切换整个 GUI 的调色板；选择持久化在 theme 设置区，组合在包级 `overrideTokens` 覆盖层之下，并在方案切换后存活。新增一套皮肤 = `src/skins.ts` 加一个条目（双模式 token 表）加两个 locale 键加一张色板卡。已延期：背景媒体（需要背景场景所需的 composer 座中和器）、悬停逐 token 预览、以及任何外部皮肤包加载。验证：12 个新 ui-theme 用例（运行时切换/重置/采纳/覆盖层下组合、引导脚本皮肤写入、SkinRow store 与 apply 接线、宿主 schema 往返）、test:gui 295 文件 / 4023 绿、typecheck 0、dev 实例上三套皮肤 × 亮暗两方案的 CDP 截图与刷新持久化检查。
