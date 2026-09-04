import { Router } from 'express';
import { db } from '../db.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, createReadStream } from 'node:fs';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE = join(__dirname, '..', '..', 'storage', 'releases');

const router = Router();

function latestForPlatform(platform, channel = 'stable', kind = 'portable') {
  const row = db.prepare(`
    SELECT v.*, a.filename, a.filepath, a.size, a.sha512, a.platform, a.kind
    FROM versions v
    JOIN assets a ON a.version_id = v.id
    WHERE a.platform = ? AND v.channel = ? AND a.kind = ?
    ORDER BY v.id DESC LIMIT 1
  `).get(platform, channel, kind);
  return row;
}

// electron-updater Windows: /win/latest.yml  (full NSIS installer)
router.get('/:platform/latest.yml', (req, res) => {
  const platformMap = { win: 'win', mac: 'mac', linux: 'linux' };
  const platform = platformMap[req.params.platform];
  if (!platform) return res.status(404).send('unknown platform');
  const row = latestForPlatform(platform, req.query.channel || 'stable', 'portable');
  if (!row) return res.status(404).send('no release for platform');

  const yml = YAML.stringify({
    version: row.version,
    files: [{
      // The URL basename is what electron-updater names the cached download
      // with; it must be the real asset filename ending in .exe. A platform
      // slug here caches an extension-less file Windows cannot execute.
      url: '/download/' + row.version + '/' + row.filename,
      sha512: row.sha512 || '',
      size: row.size
    }],
    path: row.filename,
    sha512: row.sha512 || '',
    releaseDate: row.date,
    releaseNotes: row.summary
  });
  res.type('text/yaml').send(yml);
});

// Download the full installer / portable asset.
//   /download/<version>/<filename> — electron-updater manifest URLs; the
//     basename becomes the client-cached installer filename.
//   /download/<version>/<platform> — website download links.
router.get('/download/:version/:x', (req, res) => {
  const { version, x } = req.params;
  const row = db.prepare(`
    SELECT a.* FROM assets a
    JOIN versions v ON v.id = a.version_id
    WHERE v.version = ? AND a.kind = 'portable' AND (a.filename = ? OR a.platform = ?)
  `).get(version, x, x);
  if (!row) return res.status(404).send('file not found');
  const fullPath = join(STORAGE, row.filename);
  if (!existsSync(fullPath)) return res.status(404).send('file missing');
  res.download(fullPath, row.filename);
});

// ── delta / update-package endpoints ─────────────────────────────────────
// These serve the lightweight update package (zip of changed files + manifest)
// separately from the full NSIS installer.  The client checks
// /update/:platform/latest.json, compares version + baseVersion, then downloads
// /update/:platform/download/:version and applies the delta on quit.

// Latest update-package metadata for a platform.
//   { version, baseVersion, channel, date, url, sha512, size, fullFallback }
router.get('/update/:platform/latest.json', (req, res) => {
  const platformMap = { win: 'win', mac: 'mac', linux: 'linux' };
  const platform = platformMap[req.params.platform];
  if (!platform) return res.status(404).json({ error: 'unknown platform' });
  const row = latestForPlatform(platform, req.query.channel || 'stable', 'update');
  if (!row) return res.status(404).json({ error: 'no update package for platform' });
  res.json({
    version: row.version,
    baseVersion: row.base_version ?? null,
    channel: row.channel,
    date: row.date,
    url: '/update/' + platform + '/download/' + row.version,
    sha512: row.sha512 || '',
    size: row.size,
    // fullFallback = true when there is no base version (first release /
    // full snapshot) -> client should do a full install instead of delta-patching
    fullFallback: !row.base_version
  });
});

// Download the update-package zip.
router.get('/update/:platform/download/:version', (req, res) => {
  const { platform, version } = req.params;
  const row = db.prepare(`
    SELECT a.* FROM assets a
    JOIN versions v ON v.id = a.version_id
    WHERE v.version = ? AND a.platform = ? AND a.kind = 'update'
  `).get(version, platform);
  if (!row) return res.status(404).send('update package not found');
  const fullPath = join(STORAGE, row.filename);
  if (!existsSync(fullPath)) return res.status(404).send('file missing');
  res.download(fullPath, row.filename);
});

export default router;