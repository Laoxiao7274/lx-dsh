# lx-dsh

LX-DSH — DeepSeek Harness (dsh web) 的原生桌面客户端。

基于 Electron 43 + React 19，自绘标题栏，内嵌 vendored dsh 后端，开箱即用无需全局安装 dsh。

## 特性

- **自包含**：vendor/dsh 内含完整 dsh 运行时（含魔改的 gsap 动画、图标修复等自定义改动）
- **自动更新**：轻量增量更新（delta zip + sha512 校验），支持 UAC 提权
- **插件管理**：独立的插件管理窗口，支持安装/卸载非官方插件
- **主题同步**：titlebar overlay 与 dsh web UI 暗色主题实时同步
- **帧处理优化**：Zustand store 模块级数组 O(1) push + rAF flush + LRU 会话缓存

## 开发

```bash
npm install
npm run vendor          # 从全局 npm 安装拷贝 dsh 到 vendor/dsh
npm run dev             # Vite HMR + Electron dev mode
```

Dev mode 需要设置 `LX_DSH_DEV_URL=http://localhost:5273`（或用 `npm run dev` 自动处理）。

## 构建

```bash
npm run dist            # NSIS 安装包
npm run dist:fast       # 便携版 zip
npm run dist:update     # 增量更新包
npm run dist:full       # 全部产物
```

构建流程：`build` (esbuild + vite) → `electron-builder --win --dir` → `post-vendor` (robocopy vendor) → NSIS / portable / update。

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
