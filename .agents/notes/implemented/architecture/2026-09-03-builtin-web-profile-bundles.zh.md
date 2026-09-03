# Agent Note: 内置 web profile bundle —— 随发行版携带的网页搜索与 ModLens

Status: implemented

## 问题

LX-DSH 只是"物理携带"了 `@laoxiao7274/dsh-web-search`（网页搜索 provider 及
`网页搜索` / `插件管理` / `视觉模型` 三个设置分区）和 `@liustack/modlens`
（视觉桥）——它们随 `dsh-web-app` 的依赖闭包进了安装树的 `node_modules`，
但没有任何东西激活它们。激活态存在于每台机器的
`~/.dsh/profiles/web/package.json`（`dsh.profile.bundles`），所以全新安装
或其他用户的机器按出厂的两层模板启动，三个产品界面一个都不出现。

## 决策

把两个包写进 `PROFILE_TEMPLATES.web.bundles`，并把旧的两 bundle 官方
元组登记到 `INSTALLATION_OWNED_PROFILE_TUPLES.web`：

- 全新机器直接按四 bundle 模板初始化。两个包经启动器的共享模块回退
  （`$DSH_HOME/profiles/node_modules`）解析——从安装闭包建链接，无需联网、
  无需 `pnpm install`。
- 存量官方安装在下一次 profile 加载时经 `normalizeShippedProfile`
  迁移（沿用 headless 退役元组的先例）。bundle 列表不同的 profile 是
  用户所有、原样保留——已手动装过插件的机器完全不受影响。
- 模板 bundle 不是依赖，`dsh plugin` 的 reconcile 永远不会移除它们
  （`apps/cli/src/plugin.ts`），插件管理界面把它们当内置而非可装行。

模板要生效还必须修一个启动顺序缺陷：`composeProfile` 在
`healProfilesModuleFallback` 建好共享回退链接**之前**就解析 bundle 名，
闭包携带、无本地安装的包会 `resolveBundleDir` 失败（鸡生蛋——此前能跑的
机器靠的是 pnpm 安装过的本地副本）。现在 `composeProfile` 先做一次共享
回退 heal 再加载，加载后的 profile 作用域 pass 照旧。

顺带修了验证本改动时撞上的源码启动问题：
`packages/api/gateway/src/index.ts` 把 `RemoteEventHostInfo` **类型**放进
值导出——`tsc` 产物没问题，但 tsx 的逐文件转换会抛错（master 上的
`pnpm dsh` 源码启动已经坏了）。

## 考虑过的替代方案

- **往 `dsh-web-app` 的 `cordis.patch.yml` 插插件行。** 否决：patch insert
  是纯追加（`vendor/include` 的 `applyEntryPatches`），profile 再声明同一
  bundle 会重复插行、重复 apply，`WEB_DUPLICATE_PROVIDER` 直接崩启动。
  模板路线单一声明源，`dsh plugin add` 也继续可用。
- **lx-dsh 壳首启置备**（Electron 写 profile 清单）。否决：同一事实两处
  来源，还会和用户自己的卸载决策打架。

## 后果

- 全新 `dsh --profile web` 启动即带网页搜索与视觉桥。搜索默认免 key 的
  Exa MCP；`deepseek` 选项委托给官方 provider；API key 仍是每用户配置。
- 此树系闭包里没有这两个包的部署，现在会在 profile 加载时响亮失败，
  而不是静默缺功能启动。打包运行时携带闭包（0.3.5 已验证），工作区经
  web-app 声明的依赖解析。
- 网页搜索插件已作为一等公民工作区包内置（`plugins/dsh-web-search`，
  web-app 以 `workspace:^` 依赖）——npm registry 的副本从此不再被任何环节
  消费。modlens 仍是 registry 依赖（第三方、独立发版节奏）。插件保留
  `@laoxiao7274` scope，存量 profile 清单与模板条目原样解析。
- `plugins/README.md` 承载内置包形态、添加一个内置插件的五步清单与不变式
  （模板 bundle 不是依赖；一个包在一次组合里只出现一次；包名是稳定身份）。
  dsh-web 系列走深度移植路线——包移进 `packages/` 成为核心代码（皮肤中心是
  先例），而不是堆积在这里。

[English](./2026-09-03-builtin-web-profile-bundles.md) | 中文
