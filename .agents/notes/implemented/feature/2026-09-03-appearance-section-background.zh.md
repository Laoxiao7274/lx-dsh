# Agent Note: 外观设置分区与背景图

Status: implemented

[English](2026-09-03-appearance-section-background.md) | 中文

## 问题

皮肤、配色与字号设置挤在「通用」分区里，背景图能力则完全没有。皮肤系统以三行设置塞在不相干的偏好项之间，而「给应用垫一张壁纸」——社区插件生态中被请求最多的皮肤伴生需求——在树内没有答案。

## 决策

**给外观开专属设置导航分区，并在应用外壳之下加一张持久背景图——都由 ui-theme 功能持有，都走既有接缝。**

- 分区：ui-theme 注册一个 `settings.section` 导航条目（id `appearance`，调色板图标），声明新的 `settings.appearance.item` 列表槽；方案方块、皮肤卡片与背景行注册其中。字号步进器留在通用分区（它影响会话正文，不是界面外观）。
- 背景图是 `$DSH_HOME/appearance/background.img` 下的单个持久文件（≤ 8 MiB，png/jpeg/webp/gif/avif，魔数嗅探），由三个回环宿主路由维护：`GET /api/ui-theme/background`（流式提供）、`POST .../upload`（JSON 体携带字节；原子写文件并同步设置行）、`POST .../clear`（两者一并移除）。设置行在持久主题区记录 `fileName`/`mediaType`/`opacity`——文件与行永远同进退。
- 客户端把图片投射为全屏固定层（body 上 `prepend`、`z-index: 0`、`pointer-events: none`、`background-size: cover`），由 `BackgroundPresenter` 随每份主题快照重新挂载；引导脚本在首帧前挂同一层，刷新不闪。非回环浏览器隐藏该行（路由是回环面）。
- `ThemeRuntime.setBackground` 是显示写入口；不透明度调整走同一持久行（无需重传图片）。

## 组成

- `packages/client/ui-theme/src/background-store.ts`——宿主侧文件生命周期、类型嗅探、大小上限与服务 handler（新增）。
- `packages/client/ui-theme/src/index.ts`——`ctx.webServer.register` 上的三个路由，经设置服务 `writeSection`。
- `packages/client/ui-theme/src/client/background-presenter.ts`——固定层，带 document 守卫（新增）。
- `packages/client/ui-theme/src/client/AppearanceSection.tsx` + `BackgroundRow.tsx` + `createBackgroundRowStore`——分区壳与上传/不透明度/清除行（新增）。
- `packages/client/ui-theme/src/client/index.ts`——分区与行注册、`setBackground`、快照/采纳接线。
- `packages/client/ui-theme/src/boot-theme.ts`——插件前的背景层。
- `packages/client/ui-theme/tsconfig.json`——该包现在同时需要 Node 与 DOM 两套环境类型（宿主半区是 node 进程而客户端半区是浏览器 bundle；沿用 `client/modules` 的覆写先例）。
- `packages/client/ui-primitives`——`IconPaletteOutline16`（导航图标）。

## 考虑过的替代方案

**Wallpaper Engine 式动态壁纸与位置控制。** 延期：社区插件的背景场景需要 composer 座中和器与装饰层管理器；固定 cover 层已覆盖主流诉求。

**经附件服务提供图片。** 否决：附件是按内容寻址引用的会话级媒体；设置级壁纸不是会话数据，会耦合两个生命周期。

**背景作为皮肤属性。** 否决：皮肤是纯 token 表；图片是带上传/清除语义的文件状态。保持正交让任意皮肤搭配任意壁纸。

## 后果

一个导航入口收纳全部外观面；壁纸像其它主题事实一样持久化，并与任意皮肤、两个调色板组合（层的透明度叠在调色板呈现的内容之上）。延期：背景定位控制（cover 是唯一模式）、多壁纸槽位、远端（非回环）上传。验证：13 个新 ui-theme 用例（分区/行注册与排序、仅回环的背景行、背景投射与不透明度写回、引导脚本层挂载与默认缺失、store 往返/嗅探/上限/原子替换）、icons spec 更新至 76、test:gui 绿、typecheck 0、dev 实例上带外观导航条目的设置面板 CDP 实测。
