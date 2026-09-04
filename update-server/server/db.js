import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'storage', 'update.db');
mkdirSync(join(__dirname, '..', 'storage'), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL UNIQUE,
    channel TEXT NOT NULL DEFAULT 'stable',
    summary TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    notes_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id INTEGER NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'portable',
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha512 TEXT,
    base_version TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(version_id, platform, kind)
  );
`);

// Migration: older DBs lack the kind column.
try {
  db.exec("ALTER TABLE assets ADD COLUMN kind TEXT NOT NULL DEFAULT 'portable'");
} catch (e) {
  // column already exists — nothing to do
}

// Migration: add base_version column for delta update packages (NULL for
// full installers / portable builds; set to the version the delta was built
// against for kind='update' assets).
try {
  db.exec("ALTER TABLE assets ADD COLUMN base_version TEXT");
} catch (e) {
  // column already exists — nothing to do
}
// If the old UNIQUE(version_id, platform) constraint is still in place (pre-migration
// schema), rebuild the table with the new UNIQUE(version_id, platform, kind).
const cols = db.prepare('PRAGMA table_info(assets)').all().map((c) => c.name);
if (cols.includes('kind')) {
  const idx = db.prepare("PRAGMA index_list(assets)").all();
  const oldUnique = idx.some((i) => i.unique && i.name === 'sqlite_autoindex_assets_1' &&
    db.prepare("PRAGMA index_info(" + i.name + ")").all().map((r) => r.name).join(',') === 'version_id,platform');
  if (oldUnique) {
    const rows = db.prepare('SELECT * FROM assets').all();
    db.exec('PRAGMA foreign_keys=OFF');
    db.exec('DROP TABLE assets');
    db.exec(`
      CREATE TABLE assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_id INTEGER NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'portable',
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        size INTEGER NOT NULL,
        sha512 TEXT,
        base_version TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(version_id, platform, kind)
      )
    `);
    const ins = db.prepare('INSERT INTO assets (id, version_id, platform, kind, filename, filepath, size, sha512, base_version, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (const row of rows) ins.run(row.id, row.version_id, row.platform, row.kind, row.filename, row.filepath, row.size, row.sha512, row.base_version ?? null, row.created_at);
    db.exec('PRAGMA foreign_keys=ON');
    console.log('[db] migrated assets table to UNIQUE(version_id, platform, kind)');
  }
}

console.log('[db] SQLite ready at', dbPath);
