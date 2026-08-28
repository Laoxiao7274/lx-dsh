# AGENTS.md — LX-DSH

LX-DSH 是 DeepSeek Harness 的桌面发行版：Electron 壳（`electron/`）+ 原生迁移的 dsh Web UI（`ui/`，源在 `../deepseek-harness/packages/client/`）+ 更新体系。每个会话先读本文件再动手。

## 常用命令

```sh
pnpm run dev            # 开发模式：直接启动 ../deepseek-harness/apps/cli（不走 dsh.zip）
pnpm run build          # 构建 electron 主进程（dist-electron/）
pnpm run assemble       # harness 全量构建 + deploy → dist/dsh.zip（增量时更快）
pnpm run dist:update    # build + assemble + electron-builder --dir + 更新包（增量 zip + latest.json）
pnpm run dist:full      # 同上 + NSIS 全量安装包（发布用这个）
node scripts/publish.mjs # 发布到更新服务器（读 package.json 版本 + RELEASE_NOTES.md）

注意：assemble 的 restoreWorkspaceClosure 会扫描部署树 JS 里的 @deepseek-ai/* 引用并从源码补齐 legacy hoister 丢掉的 workspace 包（0.3.0 曾因此缺 24 个包，cosmokit/cordis-plugin-group 等），sanity 步骤含 CLI 启动冒烟——部署树跑不起来会直接 fail 构建。
```

## 发布流程

1. 改 `package.json` 的 `version`，把发布内容写进 `RELEASE_NOTES.md`（条目用 `- ` 列表；它是服务端 manifest 的 `notes` 字段来源）。
2. `pnpm run dist:full`（增量 har­ness 构建约 10–20 分钟，冷构建更久）。
3. `node scripts/publish.mjs` —— 登录管理 API、创建/更新版本记录、上传安装包、校验线上 manifest，一条命令完成。凭据在 `.env.publish`（已 git-ignore；`LX_UPDATE_ADMIN_USER/LX_UPDATE_ADMIN_PASS`，也可用环境变量）。
4. 验证：`http://123.57.129.111/update/win/latest.json` 的 version/size/notes 与预期一致。

## 更新服务器（123.57.129.111）

- **架构**：Vue 官网页面 + Express/SQLite 后端（`/opt/lx-dsh-update/`），pm2 进程名 `lx-dsh-update`（注意：systemd 的 `lxcode-update` 是另一个产品，别动）。SSH 用 `~/.ssh/id_rsa`（root，公钥已装）。
- **数据**：`storage/releases/` 放安装包文件，`storage/update.db`（better-sqlite3）存 versions/assets；`/update/win/latest.json` 由服务端从 DB 实时拼装（`notes` 字段来自 `versions.summary`，2026-08-28 加的透传）。
- **发布 API**：`POST /api/admin/publish`（multipart：`file` + `version`/`channel`/`date`/`summary`/`notes`(JSON 数组字符串)/`platform`），一次性完成版本 upsert + 资产 upsert；管理 API 走 Bearer token（`POST /api/admin/login`，账密在服务器 `.env` 与本地 `.env.publish`）。改服务端代码后必须 `pm2 restart lx-dsh-update`。
- **更新通道**：现行走全量安装包（fullFallback:true，electron-updater latest.yml 路径），新装用户也能从官网下载页拿同一个包；基于 0.2.1 的增量 zip 流已构建（`build-update.mjs` 产出 + 客户端 delta 逻辑就绪），等服务端支持 `baseVersion/fullFallback` 字段后再切换。

## 已定决策

- **代码签名**：暂不做（2026-08-28 用户决定）。现状 `win.signExecutable: false`；将来若上，个人路径是 SSL.com IV（$129/年，无企业要求）或 Certum Cloud，electron-builder 原生读 `CSC_LINK`/`CSC_KEY_PASSWORD`，硬件令牌/云签用 `signtoolOptions.certificateSubjectName`。OV 签名后 SmartScreen 信誉仍需下载量积累。
- **dsh UI 不改样式快照**：Web UI 源在 deepseek-harness 仓库，LX-DSH 侧只做壳；改动在 harness 提交（其 lefthook 会跑 lint/notices 等钩子）。

## 坑

- PowerShell 5.1 `Set-Content -Encoding utf8` 写 UTF-8 **带 BOM** → `JSON.parse` 死；用 `[System.IO.File]::WriteAllText(..., UTF8Encoding($false))` 或 node。
- PowerShell 双引号 here-string 会吃反引号并插值 `${...}`——含 JS 模板字符串的代码一律用文件写入工具，不要 here-string 内插。
- harness 仓库配置了 `http.proxy=127.0.0.1:7890`，代理没开时 push 用 `git -c http.proxy= push`。
- `pnpm run test:gui`（harness）会触发 verify-deps 前置 install，无 TTY 直接失败 → 加 `--config.verify-deps-before-run=false`。
- 发布前跑测试的面在 harness 侧（test:gui / host tsc）；lx-dsh 侧改动跑 `pnpm run build` + 手动 dev 验证。
