import { Router } from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE = join(__dirname, '..', '..', 'storage', 'releases');

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const envUser = process.env.ADMIN_USER;
  const envPass = process.env.ADMIN_PASS;
  if (!envUser || !envPass) {
    return res.status(500).json({ error: 'ADMIN_USER / ADMIN_PASS 未配置（.env）' });
  }
  if (username !== envUser || password !== envPass) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign({ user: username }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: username });
});

// 验证 token
router.get('/check', authMiddleware, (req, res) => {
  res.json({ ok: true, user: req.admin.user });
});

// ===== 以下路由需要认证 =====
router.use(authMiddleware);

// 创建版本（不含安装包）
router.post('/versions', (req, res) => {
  const { version, channel, summary, date, notes } = req.body;
  if (!version || !date) return res.status(400).json({ error: 'version 和 date 必填' });
  try {
    const info = db.prepare(
      'INSERT INTO versions (version, channel, summary, date, notes_json) VALUES (?,?,?,?,?)'
    ).run(version, channel || 'stable', summary || '', date, JSON.stringify(notes || []));
    res.json({ id: info.lastInsertRowid, ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: '版本号已存在' });
    throw e;
  }
});

// 更新版本信息
router.put('/versions/:id', (req, res) => {
  const { channel, summary, date, notes } = req.body;
  db.prepare(
    'UPDATE versions SET channel=?, summary=?, date=?, notes_json=? WHERE id=?'
  ).run(channel, summary, date, JSON.stringify(notes || []), req.params.id);
  res.json({ ok: true });
});

// 删除版本
router.delete('/versions/:id', (req, res) => {
  db.prepare('DELETE FROM versions WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// 上传安装包 / 更新包
// body: platform (win/mac/linux), kind (portable|update, default portable),
//       baseVersion (optional, for kind=update: the version this delta was built against)
router.post('/versions/:id/upload', upload.single('file'), (req, res) => {
  const { id } = req.params;
  const { platform, kind, baseVersion } = req.body;
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  if (!platform) return res.status(400).json({ error: '缺少 platform 参数' });

  const version = db.prepare('SELECT * FROM versions WHERE id=?').get(id);
  if (!version) return res.status(404).json({ error: '版本不存在' });

  const assetKind = kind || 'portable';
  const ext = req.file.originalname.match(/\.[^.]+$/)?.[0] || '';
  // Include kind in filename so different asset types don't collide on disk
  const filename = assetKind === 'update'
    ? 'LX-DSH-update-' + version.version + '-' + platform + ext
    : 'LX-DSH-' + version.version + '-' + platform + ext;
  const filepath = join(STORAGE, filename);

  // 写入文件
  writeFileSync(filepath, req.file.buffer);

  // 计算 sha512
  const sha512 = createHash('sha512').update(req.file.buffer).digest('hex');

  // upsert asset (keyed on version_id + platform + kind)
  db.prepare(`
    INSERT INTO assets (version_id, platform, kind, base_version, filename, filepath, size, sha512)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(version_id, platform, kind) DO UPDATE SET
      base_version=excluded.base_version, filename=excluded.filename,
      filepath=excluded.filepath, size=excluded.size, sha512=excluded.sha512
  `).run(id, platform, assetKind, baseVersion || null, filename, filename, req.file.size, sha512);

  res.json({ ok: true, filename, kind: assetKind, baseVersion: baseVersion || null, size: req.file.size, sha512 });
});

// 删除安装包（可选 ?kind=update 指定更新包）
router.delete('/versions/:id/assets/:platform', (req, res) => {
  const { id, platform } = req.params;
  const assetKind = req.query.kind || 'portable';
  const asset = db.prepare('SELECT * FROM assets WHERE version_id=? AND platform=? AND kind=?').get(id, platform, assetKind);
  if (asset) {
    try { unlinkSync(join(STORAGE, asset.filename)); } catch {}
    db.prepare('DELETE FROM assets WHERE id=?').run(asset.id);
  }
  res.json({ ok: true });
});

export default router;