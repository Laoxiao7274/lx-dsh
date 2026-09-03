# Agent Note：Web UI 将宿主环境声明解析为布局留白

Status: implemented

[English](2026-08-21-host-environment-contract.md) | 中文

## 问题

Web UI 此前默认自己拥有整个视口。当桌面壳（LX-DSH）把页面嵌进自己的一个 webContents 并叠加自绘标题栏时，唯一的集成路径是壳向页面注入 CSS：把 body 垫下去；而每个模态浮层都是相对视口的 `position: fixed`，body 内边距动不了它们，于是只能从 Electron 主进程按各浮层的 DOM 结构追打 `role`/`:has()` 选择器。

这种耦合同时朝两个方向坏掉。它是静默的：壳匹配的是设置弹窗的 `role="presentation"` 浮层，页面任何一次重构都会让补丁失效且无任何报错。它也永远补不完：设置弹窗先顶到了壳 chrome，但 Modal 原语、图片灯箱、拖放浮层、引导舞台、toast、连接横幅全都相对视口定位——每一个都是未来的 bug 报告，每一个都需要壳再加一条选择器。

## 决策

客户端拥有"被托管形态"。嵌入方在任何页面脚本运行前声明自己：

```js
window.__DSH_HOST__ = { rev: 'host.v1', kind: 'desktop-shell', name: 'lx-dsh', chrome: { insets: { top: 44 } } }
```

启动内核解析该声明（`packages/client/web/src/host.ts`，在 `AppWebEntry.run()` 最先执行），在任何插件 bundle 绘制之前把它落成 `:root` 上的内联 `--dsh-app-inset-{top,right,bottom,left}` 自定义属性；外壳基础样式表声明浏览器形态的 `0px` 缺省值。全视口 fixed 浮层在自己的 CSS 里消费 top inset：Modal 原语、设置弹窗浮层、图片灯箱（背景内边距、关闭按钮偏移、图片最大高度）、拖放浮层、引导遮罩与舞台、toast、连接横幅。锚定弹层——Menu、Tooltip、HoverCard、JSON 树复制锚点、反馈备注面板——有意不消费：它们按触发器矩形定位，而触发器本就活在已垫高的布局里。

契约完整且宽容。缺失全局即浏览器形态：什么都不写。存在但不可用的声明（未知 `rev`、未知 `kind`、非对象值）回退到浏览器形态并给一条 console 警告——嵌入方开发者看得见，产品永不受致命影响。inset 各边独立校验：不是有限数 ≥ 0 的边带警告丢弃，合法的兄弟边照常生效。

首个嵌入方是 LX-DSH。它的 preload 通过 `contextBridge` 暴露声明，主进程彻底删除了 CSS 注入——包括 `html, body { height: 100% }` 那一半，它与本包 `base.css` 早已重复。壳只声明一次几何：共享的 `TITLEBAR_H` 常量同时供给浮层视图边界与该声明。

## 已考虑的替代方案

**保留壳侧 CSS 注入，按浮层追加 `:has()` 规则。** 即本次替换的临时补丁。拒绝：它把壳绑死在哈希化的 CSS-module DOM 内部上，页面任何重构都静默失效，且产品未来新增的每个全视口浮层都要再付一条耦合规则——正是本次改动要移除的"强行添加"形态。

**原生窗口控件覆盖层（`titleBarStyle: 'hidden'` + `titleBarOverlay`）。** Web 平台自己的这套契约——`env(titlebar-area-*)` 就是标准化的留白带。暂不采用：WCO 在原生带里渲染原生窗口控件，而本产品的 chrome 是自己 WebContentsView 里的自绘 React 浮层（品牌标、状态点、主题切换）。把 chrome 迁到 WCO 是产品决策，不是正确托管布局的前提；`chrome.insets` 的形状为那次迁移留了门，而不是关死它。

**在应用根上造包含块**（对框架施加 `transform`/`filter`/`contain: paint`），让所有 `position: fixed` 后代一次性改为相对垫高的盒子解析。拒绝：它重新收养页面里每一个 fixed 浮层——弹层锚定、portal 层级、堆叠语义全部移位。会话列早已把这类隐患当作必须规避的承重点（`ConversationRoot` 刻意不让 transform 落在布局盒上，pickers 与 modals 才能保持相对视口）。

**环境推断**——页面从查询参数或 UA 嗅探里猜自己被托管。拒绝：页面靠猜的未声明契约，就是注入式 hack 的隐性表亲。宿主声明自己的存在；页面从不推断。

## 后果

- 未来每个全视口浮层在自己的 CSS 里消费 `--dsh-app-inset-top`；壳侧永远不再加规则。新增一个消费方就是该浮层自己样式表里的一条声明。
- 较新的壳配较旧的页面（或反过来）会带着一条 console 警告退到浏览器形态，而不是布局损坏——`rev` 门让版本错配可见而非致命。
- 四边形状 upfront 声明，今天只有 `top` 有消费方；right/bottom/left 零成本待命，留给未来的 dock。
- 内联 `:root` 属性在首帧前写入，被托管页面不会闪现未垫高的一帧。
- LX-DSH 的注入通道消失；壳与页面共享同一个几何事实，而不是两份会分叉的拷贝。

## 测试

`packages/client/web/tests/host.client.spec.ts` 钉住解析规则（缺失、非对象、未知 rev、未知 kind、逐边校验、非对象 chrome）与应用行为（浏览器形态不写任何东西；被托管声明写入四条内联属性；每个被丢弃的切面各给一条 console 警告）。这些属性是插件激活前写入的内联样式——jsdom 足以证明写入与不写入；时序无需浏览器车道来确立。浏览器形态下组装输出不变，由 `DSH_SNAPSHOT=replay pnpm run test:web` 确认；既有 boot 与 base-styles 套件保持绿色，因为浏览器路径什么都不写。
