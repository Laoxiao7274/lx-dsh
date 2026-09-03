# 文件 / Git 面板整理与重设计蓝图（2026-08-29）

## 用户三点诉求 → 结论

1. **配色必须暗/亮双主题** → ✅ 本轮已修（`07837c4b4`）：diff 增/删/hunk 底色、hash、徽标全部换成
   `--dsw-alias-state-*` 别名（新增缺失的 `error-tertiary`：亮 red-100 / 暗 red-900）。
   代码视图本来就自适应（shiki css-variables 主题 + `--shiki-*` 双主题表）。
2. **要真实 IDE 质感（依赖、多文件格式渲染）** → 依赖选型见下表，落地在下轮。
3. **展开后聊天变浮动小卡不好 → 回到单应用一体化、去拥挤** → 撤掉浮动卡焦点模式，
   改业界通行的「会话列可折叠成窄条」方案（详见 §布局）。

## 调研依据（业界怎么做）

- VS Code Agents Window 的公开 bug 正好是我们的反面教材：聊天列里再开 side-by-side diff
  会挤成"五列不可用布局"（[vscode#330855](https://github.com/microsoft/vscode/issues/330855)）；
  Codex 用户也抱怨侧栏里的小 diff 窗口"代码藏在更小的窗里"（[codex#15108](https://github.com/openai/codex/issues/15108)）。
  **共识：大代码面永远不进聊天列。**
- deus-machine 的重构给出同款答案："diff 以标签页开进主区（VS Code/JetBrains 式），
  侧栏保持固定宽度只做列表"（[PR#76](https://github.com/zvadaadam/deus-machine/pull/76)）。
- t3code 用"窄右栏 + 响应式断点"保持聊天舒适（[PR#2409](https://github.com/pingdotgood/t3code/pull/2409)）。
- AI chat 布局综述：rail(会话) + 中列聊天(720-768px) + 右侧工件面板，窄屏 rail 收图标
  （[setproduct](https://www.setproduct.com/blog/ai-chat-interface-ui-design)）。

## §布局：撤浮动卡，改「会话列折叠窄条」（单应用、纯 grid、零浮层）

- 右坞头部「放大」语义改为：**会话列折叠成 44px 窄条**（竖排"会话"+未读/流式小圆点+展开钮），
  右坞扩到 `viewport − rail − 窄条`；再点还原。全程 grid 轨道动画，不遮挡任何内容。
- 焦点态浮动卡（centerFloat）、detailsFocus 浮层语义、Esc 浮层退出 → 移除；
  `detailsFocus` 改名为 `centerCollapsed`（列折叠是布局事实，不是临时浮层）。
- 拥挤感另治：坞内列表/内容两栏比例 300+rest；坞头只留 标签|折叠钮|关闭；行内操作 hover 才现。

## §真实 IDE 质感：依赖选型

| 面 | 选型 | 理由 |
|---|---|---|
| diff 渲染 | **react-diff-view**（unified/split + hunk 折叠 + 词级 diff）+ 现有 shiki 上色 | 直接吃 `git diff` 输出，主题用 CSS 变量接 `--dsw-*`；比自研行渲染省掉整套解析（[npm](https://www.npmjs.com/package/react-diff-view)）。备选 `@git-diff-view/shiki`（GitHub 风格全家桶，[docs](https://mrwangjusttodo.github.io/git-diff-view/)） |
| 代码视图 | 维持 CodeBlock（shiki css-variables，**40+ 语法**已按需加载 go/rust/java/…） | 已主题自适应，多文件格式就绪 |
| 文件图标 | **@vscode/codicons**（VS Code 官方图标集，SVG 按类型子集内联） | 真实 IDE 同源观感；不用 emoji |
| 提交历史 | 保留自研列表；后续可上 git graph（DAG 需要新 remote 方法） | v1 够用 |
| 富文件渲染 | markdown→现有 MarkdownText；图片→readFile 换 base64 通道（新 remote）；二进制→属性卡片 | 渐进 |

## 下轮施工顺序

1. 移除浮动卡 → centerCollapsed 折叠窄条（ui-layout/AppFrame/契约/测试夹具）。
2. ui-git 接 react-diff-view（私有依赖打包进 lib/client.js；unified 视图先行，split 二步）。
3. codicons 文件图标（树 + 变更列表 + diff 头）。
4. markdown 预览标签（文件页 `.md` 渲染 MarkdownText）。
5. LX-DSH 出包（用户此前"先别出包"仍有效，到验证完再议）。
