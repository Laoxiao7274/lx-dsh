import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

function versionRow(v) {
  const assets = db.prepare('SELECT platform, kind, filename, size, base_version AS baseVersion FROM assets WHERE version_id = ?').all(v.id);
  return {
    id: v.id,
    version: v.version,
    channel: v.channel,
    summary: v.summary,
    date: v.date,
    notes: JSON.parse(v.notes_json || '[]'),
    assets
  };
}

// 所有版本
router.get('/versions', (req, res) => {
  const { channel } = req.query;
  const rows = channel
    ? db.prepare('SELECT * FROM versions WHERE channel = ? ORDER BY id DESC').all(channel)
    : db.prepare('SELECT * FROM versions ORDER BY id DESC').all();
  res.json(rows.map(versionRow));
});

// 最新版本
router.get('/versions/latest', (req, res) => {
  const { channel } = req.query;
  const row = channel
    ? db.prepare('SELECT * FROM versions WHERE channel = ? ORDER BY id DESC LIMIT 1').get(channel)
    : db.prepare('SELECT * FROM versions ORDER BY id DESC LIMIT 1').get();
  if (!row) return res.status(404).json({ error: '暂无版本' });
  res.json(versionRow(row));
});

// 特定版本
router.get('/versions/:version', (req, res) => {
  const row = db.prepare('SELECT * FROM versions WHERE version = ?').get(req.params.version);
  if (!row) return res.status(404).json({ error: '版本不存在' });
  res.json(versionRow(row));
});

export default router;
