# LX-DSH 更新服务器

完整的版本发布与更新服务：Vue 前端展示页 + Node.js 后端 API + 管理后台。

## 项目结构

```
update-server/
├── .env                    # 环境变量（端口、JWT密钥、管理员账密）
├── server/                 # 后端 (Express + SQLite)
│   ├── index.js            # 入口
│   ├── db.js               # 数据库初始化
│   ├── middleware/auth.js  # JWT 认证中间件
│   └── routes/
│       ├── public.js       # 公开 API：版本查询
│       ├── admin.js        # 管理 API：登录/上传/CRUD
│       └── updater.js      # electron-updater：latest.yml + 下载
├── client/                 # 前端 (Vue 3 + Vite)
│   ├── src/
│   │   ├── App.vue         # 根组件（导航栏 + 路由出口）
│   │   ├── main.js         # 入口（路由 + scroll reveal 指令）
│   │   ├── api/index.js    # API 封装
│   │   ├── assets/         # 设计系统 CSS
│   │   └── views/          # 页面
│   │       ├── Home.vue          # 首页
│   │       ├── Download.vue      # 下载页
│   │       ├── Changelog.vue     # 更新日志
│   │       ├── VersionDetail.vue # 版本详情
│   │       ├── AdminLogin.vue    # 管理登录
│   │       └── AdminPanel.vue    # 管理面板
│   └── vite.config.js
└── storage/                # 数据 + 安装包
    ├── update.db           # SQLite 数据库
    └── releases/           # 安装包文件
```

## 快速开始

```bash
# 后端
cd server && npm install && npm start          # http://localhost:3700

# 前端
cd client && npm install && npx vite           # http://localhost:3800
```

## API 文档

### 公开 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/versions` | 所有版本（可选 `?channel=stable`） |
| GET | `/api/versions/latest` | 最新版本（可选 `?channel=beta`） |
| GET | `/api/versions/:version` | 指定版本详情 |

### electron-updater 兼容

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/win/latest.yml` | Windows 更新元数据 |
| GET | `/mac/latest.yml` | macOS 更新元数据 |
| GET | `/linux/latest.yml` | Linux 更新元数据 |
| GET | `/download/:version/:platform` | 下载安装包 |

### 管理 API（需 Bearer Token）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/login` | 登录获取 token |
| GET | `/api/admin/check` | 验证 token |
| POST | `/api/admin/versions` | 创建版本 |
| PUT | `/api/admin/versions/:id` | 修改版本 |
| DELETE | `/api/admin/versions/:id` | 删除版本 |
| POST | `/api/admin/versions/:id/upload` | 上传安装包（multipart） |
| DELETE | `/api/admin/versions/:id/assets/:platform` | 删除安装包 |

### 管理后台

访问 `http://your-host:3800/admin` 进入管理后台。

管理员账号/密码在 `.env` 中配置（`ADMIN_USER` / `ADMIN_PASS`），未配置时登录接口会拒绝并提示。

## 部署到公网

```bash
# 1. 构建前端
cd client && npm run build    # 产物在 client/dist/

# 2. 后端 serve 前端静态文件（可选，或用 Nginx 反代）
# 3. 用 PM2 守护后端进程
pm2 start server/index.js --name lx-dsh-update

# 4. Nginx 反代示例
# location / { proxy_pass http://localhost:3800; }   # 前端
# location /api { proxy_pass http://localhost:3700; } # API
# location /download { proxy_pass http://localhost:3700; }
# location /win { proxy_pass http://localhost:3700; }  # electron-updater
```

## LX-DSH 客户端对接

在 LX-DSH 的 Electron 应用中配置 electron-updater：

```js
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://your-domain.com/win/'
});
```
