<script setup>
import { ref, onMounted } from 'vue';
import { api, downloadUrl } from '../api';

const latest = ref(null);
const detectedOS = ref('正在检测…');

const platforms = [
  { key: 'win', name: 'Windows', icon: 'M3 5l8-1v8H3zM3 13h8v7l-8-1zM12 4l9-1v10h-9zM12 13h9v8l-9-1z', files: '.exe 安装包', req: 'Windows 10 及以上，64 位' },
  { key: 'mac', name: 'macOS', icon: 'M16 3c0 2-1.5 3.5-3 3.5C13 4.5 14.5 3 16 3zM18 17c-.5 1-1 2-2 2.5-1 .5-2 .5-3-.5-1 1-2 1-3 .5C9 19 8.5 18 8 17c-1-2-.5-5 1.5-6 1-.5 2-.5 3 0 1-.5 2-.5 3 0 2 1 2.5 4 1.5 6z', files: '.dmg · Apple Silicon + Intel', req: 'macOS 12 Monterey 及以上' },
  { key: 'linux', name: 'Linux', icon: 'M12 2c-2 0-3 2-3 4 0 1 0 2-.5 3S7 10 7 12c0 2 2 3 5 3s5-1 5-3c0-2-1-2-1.5-3S15 7 15 6c0-2-1-4-3-4zM9 16l-1 3-2 1M15 16l1 3 2 1M10 18l2 2 2-2', files: '.AppImage · .deb · .rpm', req: 'Ubuntu 20.04 / Fedora 36 及以上' },
];

onMounted(async () => {
  // 检测操作系统
  const ua = navigator.userAgent;
  if (ua.includes('Win')) detectedOS.value = 'Windows';
  else if (ua.includes('Mac')) detectedOS.value = 'macOS';
  else if (ua.includes('Linux')) detectedOS.value = 'Linux';
  else detectedOS.value = '未知系统';

  try { latest.value = await api.getLatest(); } catch {}
});

function assetInfo(platform) {
  if (!latest.value) return null;
  return latest.value.assets.find(a => a.platform === platform);
}
function fmtSize(bytes) {
  if (!bytes) return '—';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
</script>

<template>
  <section class="section hero" v-reveal>
    <div class="container hero-center">
      <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:var(--ok-soft);font-size:13px;margin-bottom:20px;">
        <span class="status-dot"></span>
        <span>检测到你的系统：<strong>{{ detectedOS }}</strong></span>
      </div>
      <h1>下载 LX-DSH</h1>
      <p class="lead">免费、跨平台。当前稳定版 v{{ latest?.version || '—' }}。</p>
    </div>
  </section>

  <section class="section" v-reveal style="padding-top:0;">
    <div class="container stack" style="gap:var(--gap-lg);">
      <div style="max-width:40ch;">
        <p class="eyebrow">选择平台</p>
        <h2>三平台，一个体验。</h2>
      </div>
      <div class="grid-3">
        <div class="platform-card" v-for="p in platforms" :key="p.key">
          <div class="pc-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path :d="p.icon"/></svg></div>
          <h3>{{ p.name }}</h3>
          <span class="pc-ver num">v{{ latest?.version || '—' }} · {{ assetInfo(p.key) ? fmtSize(assetInfo(p.key).size) : '—' }}</span>
          <span class="pc-files">{{ p.files }}</span>
          <p class="pc-req">{{ p.req }}</p>
          <a v-if="latest && assetInfo(p.key)" class="btn btn-secondary pc-btn" :href="downloadUrl(latest.version, p.key)">下载 {{ p.name }} 版</a>
          <span v-else class="btn btn-secondary pc-btn" style="opacity:0.5;cursor:default;">暂未发布</span>
        </div>
      </div>
      <p class="meta" style="text-align:center;">所有安装包均经 SHA-512 校验，下载后客户端自动验证完整性。</p>
    </div>
  </section>
</template>
