# Agent Note: 轨迹页 v4 调研对齐的执行轨迹浏览器

Status: implemented

[English](2026-08-31-trajectory-v4-trace-explorer.md) | 中文

在[轨迹检查台账](../feature/2026-07-27-trajectory-inspection-ledger.zh.md)的第四次视觉语言上扩展;台账机制仍以该 note 为准。

## 问题

轨迹页经历三轮原型,先后被评价为丑、乱、不好看,已发布的视觉语言无法满足自己的用户。对同类产品的调研(`opendesign/research-trace-ui.md`,截图本地存档)确立了 Langfuse、LangSmith、Copilot coding agent、Claude Code web、Codex cloud 收敛出的六条规则:

1. 步骤树是主角,瀑布是次级 minimap。
2. 事件类型 = 小描边图标 + 名称,永远不用彩色行底或大节点。
3. 时延是唯一被强调的数字:平常灰,>= 20 s 琥珀,>= 60 s 红。
4. 时延紧跟名称,小号灰字尾巴;右缘保持安静。
5. 检查器保持「chip + 下划线 tab + 描边输入/输出卡」。
6. 整面近乎单色,一个 accent 只给选中与链接。

获批的 v4 原型(`opendesign/prototype-trajectory.html`)实现这些规则;本次改动把它落进包内。

## 决策

- 行高:内容行 26 到 38、折叠摘要 22 到 28(`trajectory-virtual-rows.ts`),轮次头 34 到 44、步骤行 22 到 26(`trajectory-structure-rows.ts`);CSS 同步镜像。
- 新纯模块 `trajectory-row-metrics.ts`:每条记录一个行内度量尾巴(工具/子工具时长;助手时长 + 输出 token;用户输入 token;压缩时长)。`running` 返回本地化的运行中标签交给 CSS 扫光;`error` 保留本地化的失败词。`formatHeadDuration` 移入 `trajectory-record.ts` 以复用。
- 台账行:可见的 kind 微标签删除(18 px 描边图标方块、其 tooltip 与行 aria-label 继续承担类型识别);1 px 树轨 + 肘形连接线把轮次下的各行连起来;度量尾巴右对齐渲染并带 slow/xslow 色调。
- 轮次头渲染 `T{n}` 方块 chip、13 px/500 标题与度量 chip;步骤行是等宽小注,带 `#n` 请求 chip 与点线。
- 时间轴降为 44 px minimap:更细的圆帽 span、按类型的高度、工具紫 tint(局部 `--trajectory-violet-tint`,沿用 ContextMeter 的局部 tint 先例)、10 px 轮次标签。
- 选中洗涤改为 5 % 中性混合;运行中行用 background-clip 文字扫光;失败行在尾部显示红色失败词。

## 测试

- `virtual-rows.client.spec.ts` 高度字面量 38/28 与显式 44。
- `table.client.spec.tsx` 尾部可达性滚动改用 99 999,更高的虚拟行仍能暴露最后的折叠行。
- 新 `row-metrics.client.spec.ts` 覆盖每个尾巴拼装与色调分支(逐文件覆盖门)。
- 类型层面恒真的守卫(`'head' in record && ...`、`own !== undefined`)改写为类型系统可证明的等价单检查;行为不变,由既有套件覆盖。

## 考虑过的替代方案

**v1 工程驾驶舱** —— 台账上方一排仪表卡。被否:视觉嘈杂,把步骤树挤到折叠线下方,重复了行自身本可承载的数字。

**v2 项目 DNA 轨道** —— 按事件类型着色的横向轨道。被否:语义不清,颜色同时承载类型与状态,而六规调研证实同类产品从不用行底表示类型。

**v3 形态编码行** —— 带大类型徽章的字形编码行。被否:风格不符,徽章的分量与小图标+名称的惯例、近乎单色的整面相抵触。

## 后果

v4 规则成为已发布的视觉语言;台账的数据机制(虚拟化、选中、搜索)在其下不变。已知观察(非本次引入):当 null 轮次的 section 重复 `Step 1` 分组时,React 警告 `step-row%000%00Step%201%001` 键重复;`decorateLedgerRows` 的键后缀方案早于本次改动,需要单独修复。
