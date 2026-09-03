# 轨迹页调研笔记(2026-08-30)

目的:轨迹页 v1-v3 连续被否(丑 → 乱/分不清 → 不好看),这次先调研真实产品再动手。

## 看了什么(一手界面截图)

| 产品 | 界面 | 来源 |
|---|---|---|
| Langfuse | Trace 列表 + span 树 + 右侧详情 | langfuse.com/docs/tracing(官方文档截图) |
| LangSmith | Trace span 树 + 右侧详情(暗色) | langchain.com/langsmith(产品页截图) |
| GitHub Copilot coding agent | 会话/日志(营销图为主,细节从 docs 补) | github.blog |
| Claude Code on the web / Codex cloud | 会话 transcript 流 | anthropic.com/news、openai.com(正文截图少,结合产品内知识) |

## 行业收敛出的六条规则(与我们 v1-v3 的偏差)

1. **主舞台是「步骤树」,不是瀑布。** LangSmith 默认树视图,瀑布是角落里的一个切换按钮;Langfuse 列表+树为主,时延图是独立 tab。我们三个版本都把彩色瀑布放在 C 位——反行业惯例。
2. **类型识别靠「小图标 + 名称」,不靠色块/底色/大圆节点。** LangSmith 用 16px 圆角描边图标(链=紫、LLM=品牌 logo、工具=红、向量=绿),Langfuse 用小图标;全行永远没有彩色底。我的 v1 彩虹标签、v3 三种形态+大圆节点都是偏离。
3. **时延是唯一的"彩色数据":** 正常=灰,慢=琥珀,超时=红(Langfuse span 树里 39.12s 红、27.09s 橙、正常灰)。类型不用颜色编码,性能用。
4. **时长紧跟名称**,小一号灰字(LangSmith:`create_research_plan 1.38s`),右侧留白;不是右侧对齐一长串指标。
5. **右侧详情面板 = 图标+名称 → 一行灰色小 chip(时延/Session/环境/版本)→ 下划线 tabs → Input/Output 描边卡片**。Langfuse/LangSmith 高度一致。
6. **整体近乎单色**:白底(或近黑底)、灰字、等宽仅用于名称与 JSON、发丝线、大留白;accent 一个,只给选中/链接。

## v4 决策

- 顶部彩色瀑布 → **36px 细 minimap**(轮次带 + 事件刻度 + 选区刷),交互保留,存在感降级
- 26px 大圆节点/三形态 → **LangSmith 式树**:16px 描边图标 + 肘形连接线,名称前置,时延贴名
- 类型图标可带轻微色彩(工具琥珀/LLM 蓝/系统灰),但面积仅 16px;状态图标绿勾/红叉只在有意义处
- 时延色阶:>20s 琥珀、>40s 红,其余灰
- 检查器:chip 行 + tabs + Input/Output 描边卡
- 全部保持项目 DSW token(r12 卡、r999 圆钮、sans tabular、微点、扫光)

## 截图证据

本地:`DSH/.tmp-research/langfuse-trace.png`、`langsmith-trace.png`(用后清理,原图见上表 URL)
