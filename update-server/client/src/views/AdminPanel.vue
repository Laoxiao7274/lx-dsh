<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const versions = ref([]);
const loading = ref(true);
const showCreate = ref(false);

// 创建表单
const form = ref({ version: '', channel: 'stable', summary: '', date: new Date().toISOString().slice(0,10).replace(/-/g,'.'), notes: [] });
const noteInput = ref({ tag: '新增', text: '' });

// 上传状态
const uploading = ref({});

function logout() {
  localStorage.removeItem('admin_token');
  router.push('/admin/login');
}

async function loadVersions() {
  loading.value = true;
  versions.value = await api.getVersions();
  loading.value = false;
}

async function createVersion() {
  try {
    await api.createVersion(form.value);
    showCreate.value = false;
    form.value = { version: '', channel: 'stable', summary: '', date: new Date().toISOString().slice(0,10).replace(/-/g,'.'), notes: [] };
    await loadVersions();
  } catch (e) {
    alert(e.message);
  }
}

function addNote() {
  if (!noteInput.value.text) return;
  form.value.notes.push({ ...noteInput.value });
  noteInput.value.text = '';
}

function removeNote(i) {
  form.value.notes.splice(i, 1);
}

async function deleteVersion(id) {
  if (!confirm('确定删除这个版本及其所有安装包？')) return;
  await api.deleteVersion(id);
  await loadVersions();
}

async function uploadFile(id, platform, event) {
  const file = event.target.files[0];
  if (!file) return;
  const key = id + '-' + platform;
  uploading.value[key] = true;
  try {
    await api.uploadAsset(id, platform, file);
    await loadVersions();
  } catch (e) {
    alert('上传失败: ' + e.message);
  }
  uploading.value[key] = false;
  event.target.value = '';
}

async function deleteAsset(id, platform) {
  if (!confirm('删除这个安装包？')) return;
  await api.deleteAsset(id, platform);
  await loadVersions();
}

const platforms = [
  { key: 'win', name: 'Windows' },
  { key: 'mac', name: 'macOS' },
  { key: 'linux', name: 'Linux' },
];

function fmtSize(bytes) {
  if (!bytes) return '—';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

onMounted(loadVersions);
</script>

<template>
  <div style="min-height:100vh;background:var(--bg);">
    <!-- admin header -->
    <header style="border-bottom:1px solid var(--border);position:sticky;top:0;z-index:50;background:color-mix(in oklch,var(--bg) 90%,transparent);backdrop-filter:blur(16px);">
      <div class="container" style="display:flex;align-items:center;justify-content:space-between;padding-block:13px;">
        <span class="logo"><span class="mark"></span>LX-DSH 管理</span>
        <div style="display:flex;gap:12px;align-items:center;">
          <button class="btn btn-primary" @click="showCreate = !showCreate">{{ showCreate ? '取消' : '发布新版本' }}</button>
          <button class="btn btn-ghost" @click="logout">退出</button>
        </div>
      </div>
    </header>

    <div class="container" style="padding-block:32px;">
      <!-- 创建版本表单 -->
      <div v-if="showCreate" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:28px;margin-bottom:32px;">
        <h2 style="margin-bottom:24px;">发布新版本</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
          <div>
            <label class="meta" style="display:block;margin-bottom:6px;">版本号</label>
            <input v-model="form.version" type="text" placeholder="2.5.0" style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius);font-size:14px;background:var(--bg);outline:none;" />
          </div>
          <div>
            <label class="meta" style="display:block;margin-bottom:6px;">通道</label>
            <select v-model="form.channel" style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius);font-size:14px;background:var(--bg);outline:none;">
              <option value="stable">稳定版</option>
              <option value="beta">测试版</option>
            </select>
          </div>
        </div>
        <div style="margin-bottom:16px;">
          <label class="meta" style="display:block;margin-bottom:6px;">发布日期</label>
          <input v-model="form.date" type="text" placeholder="2026.05.20" style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius);font-size:14px;background:var(--bg);outline:none;" />
        </div>
        <div style="margin-bottom:16px;">
          <label class="meta" style="display:block;margin-bottom:6px;">版本摘要</label>
          <textarea v-model="form.summary" rows="2" placeholder="一句话描述这个版本" style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius);font-size:14px;background:var(--bg);outline:none;resize:vertical;"></textarea>
        </div>

        <!-- 更新内容 -->
        <div style="margin-bottom:16px;">
          <label class="meta" style="display:block;margin-bottom:6px;">更新内容</label>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <select v-model="noteInput.tag" style="padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px;background:var(--bg);">
              <option>新增</option>
              <option>优化</option>
              <option>修复</option>
            </select>
            <input v-model="noteInput.text" type="text" placeholder="描述变更内容" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px;background:var(--bg);outline:none;" @keydown.enter="addNote" />
            <button type="button" class="btn btn-secondary" @click="addNote" style="padding:8px 16px;">添加</button>
          </div>
          <div v-if="form.notes.length" style="display:flex;flex-direction:column;gap:6px;">
            <div v-for="(note, i) in form.notes" :key="i" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg);border-radius:var(--radius);">
              <span class="tag-mini" :class="{ 'tag-new': note.tag==='新增', 'tag-perf': note.tag==='优化', 'tag-fix': note.tag==='修复' }">{{ note.tag }}</span>
              <span style="flex:1;font-size:14px;">{{ note.text }}</span>
              <button @click="removeNote(i)" style="border:none;background:none;color:var(--muted);cursor:pointer;font-size:16px;">×</button>
            </div>
          </div>
        </div>

        <button class="btn btn-primary" @click="createVersion">创建版本</button>
        <p class="meta" style="margin-top:8px;">创建后可在版本卡片上传各平台安装包。</p>
      </div>

      <!-- 版本列表 -->
      <div v-if="loading" class="meta" style="text-align:center;padding:60px 0;">加载中…</div>
      <div v-else-if="versions.length === 0" class="meta" style="text-align:center;padding:60px 0;">暂无版本，点击「发布新版本」创建。</div>

      <div v-for="v in versions" :key="v.id" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <h3 style="margin:0;font-size:18px;">v{{ v.version }}</h3>
            <span class="pill" :class="v.channel === 'stable' ? 'stable' : 'beta'">{{ v.channel === 'stable' ? '稳定版' : '测试版' }}</span>
            <span class="meta num">{{ v.date }}</span>
          </div>
          <button class="btn btn-danger" style="padding:6px 14px;font-size:13px;" @click="deleteVersion(v.id)">删除版本</button>
        </div>
        <p v-if="v.summary" style="color:var(--muted);font-size:14px;margin:0 0 16px;">{{ v.summary }}</p>

        <!-- 安装包管理 -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
          <div v-for="p in platforms" :key="p.key" style="border:1px solid var(--border);border-radius:var(--radius);padding:14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <span style="font-size:14px;font-weight:500;">{{ p.name }}</span>
              <span class="meta num">{{ v.assets.find(a => a.platform === p.key)?.size ? fmtSize(v.assets.find(a => a.platform === p.key).size) : '未上传' }}</span>
            </div>
            <div v-if="uploading[v.id + '-' + p.key]" class="meta" style="font-size:13px;">上传中…</div>
            <div v-else style="display:flex;gap:8px;">
              <label style="flex:1;cursor:pointer;">
                <span class="btn btn-secondary" style="width:100%;padding:8px;font-size:13px;">选择文件</span>
                <input type="file" style="display:none;" @change="uploadFile(v.id, p.key, $event)" />
              </label>
              <button v-if="v.assets.find(a => a.platform === p.key)" @click="deleteAsset(v.id, p.key)" style="border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);padding:8px 10px;cursor:pointer;color:var(--danger);font-size:13px;">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
