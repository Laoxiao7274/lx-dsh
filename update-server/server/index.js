import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import './db.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import updaterRoutes from './routes/updater.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3700;
const STORAGE = join(__dirname, '..', process.env.STORAGE_DIR || 'storage', 'releases');

mkdirSync(STORAGE, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/static', express.static(STORAGE));

// routes
app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/', updaterRoutes);

app.listen(PORT, () => {
  console.log(`[server] LX-DSH update server on http://localhost:${PORT}`);
});
