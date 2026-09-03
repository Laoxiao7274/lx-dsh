# AGENTS.md — LX-DSH

LX-DSH 是 DeepSeek Harness 的桌面发行版，**单仓结构**：Electron 壳（`electron/`、`ui/`）+ 完整 harness 源码树（`harness/`，git subtree squash 导入）+ 更新体系。每个会话先读本文件再动手。

## 仓库布局与上游同步

- `harness/` 是产品本体（@deepseek-ai 全部包，从上游 fork 而来）。日常产品开发 = 直接改 `harness/` 里的代码，与壳同一套提交历史。
- 上游 remote：`upstream` = github.com/deepseek-ai/deepseek-harness。
- **同步上游**（冲突就地解决，之后跑门禁）：

```sh
git fetch upstream
git subtree pull --prefix=harness upstream master --squash
# 门禁（在 harness/ 内跑）：pnpm run build && pnpm --config.verify-deps-before-run=false run test:gui
```

- harness 历史：本仓库以 squash 形式导入（`1b92b7e`，对应老 fork 的 `0fed6c2`）；完整提交历史保留在归档目录 `../deepseek-harness.migrated-*`（历史 vault，勿删）。如需升级为全历史导入，网络畅通时重做 subtree add（非 squash）并 cherry-pick 后续提交。
- ⚠️ 直连 GitHub 大流量传输会被掐（curl 18 / 连接重置）。大 clone/fetch 用代理（本机 7890 Clash）或小批量 depth 递增；小 fetch 正常。

## 常用命令

```sh
pnpm run dev            # 开发模式：直接启动 harness/apps/cli（workspace 构建产物）
pnpm run build          # 构建 electron 主进程（dist-electron/）
pnpm run assemble       # harness 全量构建 + deploy → dist/dsh.zip（增量时更快）
pnpm run dist:update    # build + assemble + electron-builder --dir + 更新包（增量 zip + latest.json）
pnpm run dist:full      # 同上 + NSIS 全量安装包（发布用这个）
node scripts/publish.mjs # 发布到更新服务器（读 package.json 版本 + RELEASE_NOTES.md）

注意：assemble 的 restoreWorkspaceClosure 会扫描部署树 JS 里的 @deepseek-ai/* 引用并从源码补齐 legacy hoister 丢掉的 workspace 包（0.3.0 曾因此缺 24 个包，cosmokit/cordis-plugin-group 等）；裁剪后的树必须通过 CLI 启动冒烟才会出货。dsh 运行时以**普通目录**内置于安装包（resources/dsh/，extraResources: dist/dsh），后端直接从安装目录启动——没有 zip、没有首次解压、没有 %APPDATA% 副本、没有全局回退（0.3.2 起，dsh.zip 仅留给未来增量更新流程）。
```

## 门禁（harness 改动的提交纪律）

harness 的 lefthook 钩子**不再自动运行**（subtree 吸收后 hooks 归宿变化；`harness/scripts/install-lefthook.mjs` 在嵌套位置是安全 no-op）。改了 `harness/` 后、push 前手动跑：

```sh
cd harness
pnpm --config.verify-deps-before-run=false run test:gui     # 主测试门禁
pnpm run lint                                              # 改了 ts/tsx 时
node_modules/.bin/tsx scripts/verify-agent-note-format.ts   # 改了 .agents/notes 时
node_modules/.bin/tsx scripts/gen-third-party-notices.ts    # 改了任何 package.json / pnpm-lock 后必须重新生成 THIRD_PARTY_NOTICES.md
git diff --cached --check                                  # 空白检查
```

已知的嵌套位置限制：harness 内少数脚本用 `git rev-parse --show-toplevel` 定位仓库根，在单仓结构下会解析到 lx-dsh 根而失效（`change-scope.ts`、`check-expected-filenames.sh`、`wine-windows-gates.sh`、`publish-npm-baseline.ts`、`merge-translation-pairing.ts`）。日常回路（build/test/lint/verify-*）基于 cwd，不受影响。翻译配对合并驱动已配到 lx-dsh 侧（`merge.dsh-translation-pairing.driver` 指向 `harness/scripts/...`）。

## 发布流程

1. 改 `package.json` 的 `version`，把发布内容写进 `RELEASE_NOTES.md`（条目用 `- ` 列表；它是服务端 manifest 的 `notes` 字段来源）。
2. `pnpm run dist:full`（增量 harness 构建约 10–20 分钟，冷构建更久）。
3. `node scripts/publish.mjs` —— 登录管理 API、创建/更新版本记录、上传安装包、校验线上 manifest，一条命令完成。凭据在 `.env.publish`（已 git-ignore；`LX_UPDATE_ADMIN_USER/LX_UPDATE_ADMIN_PASS`，也可用环境变量）。
4. 验证：`http://123.57.129.111/update/win/latest.json` 的 version/size/notes 与预期一致。

## 更新服务器（123.57.129.111）

- **架构**：Vue 官网页面 + Express/SQLite 后端（`/opt/lx-dsh-update/`），pm2 进程名 `lx-dsh-update`（注意：systemd 的 `lxcode-update` 是另一个产品，别动）。SSH 用 `~/.ssh/id_rsa`（root，公钥已装）。
- **数据**：`storage/releases/` 放安装包文件，`storage/update.db`（better-sqlite3）存 versions/assets；`/update/win/latest.json` 由服务端从 DB 实时拼装（`notes` 字段来自 `versions.summary`，2026-08-28 加的透传）。
- **发布 API**：`POST /api/admin/publish`（multipart：`file` + `version`/`channel`/`date`/`summary`/`notes`(JSON 数组字符串)/`platform`），一次性完成版本 upsert + 资产 upsert；管理 API 走 Bearer token（`POST /api/admin/login`，账密在服务器 `.env` 与本地 `.env.publish`）。改服务端代码后必须 `pm2 restart lx-dsh-update`。
- **更新通道**：现行走全量安装包（fullFallback:true，electron-updater latest.yml 路径），新装用户也能从官网下载页拿同一个包；基于 0.2.1 的增量 zip 流已构建（`build-update.mjs` 产出 + 客户端 delta 逻辑就绪），等服务端支持 `baseVersion/fullFallback` 字段后再切换。

## 已定决策

- **代码签名**：暂不做（2026-08-28 用户决定）。现状 `win.signExecutable: false`；将来若上，个人路径是 SSL.com IV（$129/年，无企业要求）或 Certum Cloud，electron-builder 原生读 `CSC_LINK`/`CSC_KEY_PASSWORD`，硬件令牌/云签用 `signtoolOptions.certificateSubjectName`。OV 签名后 SmartScreen 信誉仍需下载量积累。
- **包名不改**：harness 内 176+ 个 `@deepseek-ai/*` 包名保留（单仓吸收时明确决定，2026-09-03）。改名牵动数千引用 + 锁文件 + cordis.patch.yml + 生成器，纯装饰收益；"我们的项目"靠仓库所有权（github.com/Laoxiao7274/lx-dsh，公开）实现。
- **dsh UI 不改样式快照**：Web UI 源在 `harness/packages/client/`，LX-DSH 侧只做壳；改动与壳同一仓库提交。

## 坑

- PowerShell 5.1 `Set-Content -Encoding utf8` 写 UTF-8 **带 BOM** → `JSON.parse` 死；用 `[System.IO.File]::WriteAllText(..., UTF8Encoding($false))` 或 node。
- PowerShell 双引号 here-string 会吃反引号并插值 `${...}`——含 JS 模板字符串的代码一律用文件写入工具，不要 here-string 内插。
- PowerShell 管道里 git 的 stderr 会被当成 NativeCommandError（红字噪音）——判断成败看 exit code 与实际输出。
- git 大流量操作被杀会留 `shallow.lock` / `tmp_pack_*` 残留 → 之后所有 fetch 报 "File exists"/exit 128；清掉锁再试。
- 直连 GitHub 大单流（>几十 MB）易被掐断（curl 18 early EOF）——分批 depth 递增或走代理；`git ls-remote` 可用于探连通性。
- `pnpm run test:gui`（harness）会触发 verify-deps 前置 install，无 TTY 直接失败 → 加 `--config.verify-deps-before-run=false`。
- 发布前跑测试的面在 harness 侧（test:gui / host tsc）；lx-dsh 侧改动跑 `pnpm run build` + 手动 dev 验证。
