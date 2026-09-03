# lx-dsh

LX-DSH — DeepSeek Harness (dsh web) 的原生桌面客户端，**单仓结构**（壳 + harness 源码一体）。

基于 Electron 43 + React 19，无标题栏（chrome 内嵌于 dsh web UI 的 Session Header），后端直接运行仓库内 `harness/` 树的构建产物，开箱即用无需全局安装 dsh。

## 特性

- **单仓全源码**：harness 完整源码树内置于 `harness/`（自上游 fork，`git subtree` squash 导入），所有 @deepseek-ai 包都是本仓库的构建产物，没有 npm 发布版基底；一次 clone 即完整产品
- **上游同步**：`git subtree pull --prefix=harness upstream master --squash`（详见 AGENTS.md）
- **自动更新**：轻量增量更新（delta zip + sha512 校验），支持 UAC 提权
- **插件管理**：独立的插件管理窗口，支持安装/卸载非官方插件
- **窗口 chrome**：无标题栏；拖拽区/最小化/最大化/关闭由 ui-lx-shell 注入 Session Header 与 hero

## 开发

```bash
pnpm install            # 壳依赖
cd harness && pnpm install   # harness 依赖（独立 workspace，就近生效）
npm run dev             # Vite HMR + Electron dev mode
```

dev 模式后端直接运行 `harness/apps/cli`（workspace 构建产物）——改后端包后 `pnpm run build:lib`（harness/ 内）增量编译即可，无需重新 deploy。可用 `LX_DSH_ROOT` 覆盖运行时位置。

首次前需在 `harness/` 执行过一次 `pnpm run build`（tsc -b host+client + tsdown + vite web）。

## 构建

```bash
npm run dist            # NSIS 安装包
npm run dist:fast       # 便携版 zip
npm run dist:update     # 增量更新包
npm run dist:full       # 全部产物
```

构建流程：`build` (esbuild + vite) → `assemble` (harness/ 全量构建 → `pnpm deploy` 物化 CLI 闭包 → 裁剪 → dist/dsh.zip) → `electron-builder --win --dir` → NSIS / portable / update。

## 更新服务器

更新服务器在 `http://123.57.129.111`，API 路由：
- `GET /update/win/latest.json` — LX-DSH 自定义更新协议
- `GET /win/latest.yml` — electron-updater 兼容格式
- `GET /download/:version/:platform` — 安装包下载

## 技术栈

- Electron 43 + esbuild (CJS bundle)
- React 19 + Vite 6 + Tailwind CSS 4 + shadcn/ui
- Zustand (状态管理)
- GSAP (动画)
- better-sqlite3 (更新服务器)
