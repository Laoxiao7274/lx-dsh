# Agent Note: 皮肤中心 v2 资产架构移植

Status: implemented

[English](2026-09-03-skin-center-port.md) | 中文

## 问题

内置皮肤以三张编译期 token 表交付，在 `ThemeRuntime` 内组合。这把皮肤库限定在手写调色板，无法表达背景画、任意选择器级别的皮肤样式或社区皮肤——整个 dsh-market.com 皮肤生态（28+ 套）都够不着。社区皮肤中心用资产目录架构解决了这一切（manifest v2 + CSS 安全管道 + 运行时切换引擎），但作为外部插件我们不会随产品分发。

## 决策

**把社区皮肤中心整体移植进 ui-theme（Apache-2.0，zhu1090093659/dsh-web），退役编译期 token 方案。**

- **皮肤是纯资产目录**（`skin.json` + `skin.css` + 可选 `patches.css`/`hooks.mjs`/`assets/`）——无包、无启动图。20 套宽松协议社区皮肤随包内置在 `packages/client/ui-theme/skins/`（blue-fantasy、whale-song、cyber-night、catppuccin、tokyo-night、furina、miku、mint…）；我们自己的两套 token 皮肤（verdigris、midnight-ember）迁移为同格式。NC 协议皮肤不进包——经市场到达。
- **宿主半区**（`src/skin-center/`）：fail-closed 清单校验器、CSS 安全管道（lightningcss 解析 + 选择器 scope 到 `html[data-dsh-skin]`、`@import`/远程 URL 拒绝、token 审计 + 自动补 fallback tint）、双源仓库扫描（用户 `$DSH_HOME/skins` 遮蔽内置；指纹记忆化）、v2 路由（`/api/skin-center/v2/catalog|skins/<id>/stylesheet|assets|hooks|active|verify`，同源围栏）。
- **客户端半区**（`src/client/skin-center/`）：切换引擎（试穿/应用共享一个原子 latest-wins 控制器；每次激活入账本且完全可撤销）、六个固定装饰层、背景场景、背景偏好滑杆（遮挡/分态模糊/输入卡模糊/气泡透明度）经 v2 active 通道持久化。
- **ThemeRuntime 集成**：`setSkin` 变为直通标记（引导脚本需要活动 id 做首帧；v2 通道拥有真正的切换）。`composeActive` 不再折叠皮肤 token。index tap 在首帧前注入活动皮肤的样式表 `<link>` + `data-dsh-skin` 属性——刷新不闪原生外观。
- **市场**：浏览器行经回环宿主代理浏览 `dsh-market.com/manifest/skins.json` 并一键安装（`/api/ui-theme/market/install-skin`）；安装器是社区加固版（路径白名单、大小上限、暂存-改名原子写、sha256 溯源——也是 hooks 信任信号）。

## 组成

- 宿主：`skin-repo.ts`（向上走找包根——src/、lib/ 与部署布局的目录树各不相同）、`routes-v2.ts`、`core/{manifest-v2,css-safety}`、`provenance.ts`、`active-state.ts`、`market/{installer,routes}.ts`。
- 客户端：`runtime/{skin-controller,effect-ledger,decoration-layers,backdrop-scene,boot,semantic-adapter,shell-rendering}.ts`、`background.ts`（BackgroundController）、`SkinCenterRow.tsx` + module css、`skin-center-apply.ts`（引导接线 + 市场回调）。
- 退役：`src/skins.ts`、`SkinRow.tsx`、`createSkinRowStore`。
- `package.json`：`lightningcss ^1.32.0` 依赖；`files` 白名单列出每个皮肤目录。

## 考虑过的替代方案

**保留 token 表模型并添加基于 token 的社区皮肤。** 否决：没有背景媒体、没有选择器级样式、每套社区皮肤都要手工转换，市场（服务资产目录）仍然够不着。

**在旁边安装社区插件。** 产品上否决：两套切换引擎、两条持久化通道、一等外观面耦合第三方发布节奏。

## 后果

任何 dsh-web 皮肤目录——内置、市场安装或手放进 `$DSH_HOME/skins`——都出现在外观分区，带试穿、一键应用与完全撤销；刷新直接引导进活动皮肤。移植中延期：Wallpaper Engine 面板、自定义主题（用户调色板）控制器、卸载 UI、完整性校验卡。构建面教训：`pnpm --filter … run bundle` 只重建 client bundle；宿主半区需要 `build:lib:client`，过期的宿主静默服务零内置皮肤。验证：8 个新皮肤中心用例（清单校验 fail-closed、CSS scope/白名单、目录排序/遮蔽/诊断）+ 重写的 theme/apply spec（ui-theme 共 103，297 文件 / 4036 绿），以及 CDP 实测：24 张卡渲染、Blue Fantasy 应用 → `data-dsh-skin=blue-fantasy` + 持久化 active + 背景画、原生恢复为 null。
