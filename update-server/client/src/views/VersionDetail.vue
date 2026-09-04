<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import { api, downloadUrl } from '../api';

const route = useRoute();
const version = ref(null);
const allVersions = ref([]);
const loading = ref(true);

const tagClass = { '新增': 'tag-new', '优化': 'tag-perf', '修复': 'tag-fix' };

const platforms = [
  { key: 'win', name: 'Windows', ext: '.exe', icon: 'M3 5l8-1v8H3zM3 13h8v7l-8-1zM12 4l9-1v10h-9zM12 13h9v8l-9-1z' },
  { key: 'mac', name: 'macOS', ext: '.dmg', icon: 'M16 3c0 2-1.5 3.5-3 3.5C13 4.5 14.5 3 16 3zM18 17c-.5 1-1 2-2 2.5-1 .5-2 .5-3-.5-1 1-2 1-3 .5C9 19 8.5 18 8 17c-1-2-.5-5 1.5-6 1-.5 2-.5 3 0 1-.5 2-.5 3 0 2 1 2.5 4 1.5 6z' },
  { key: 'linux', name: 'Linux', ext: '.AppImage', icon: 'M12 2c-2 0-3 2-3 4 0 1 0 2-.5 3S7 10 7 12c0 2 2 3 5 3s5-1 5-3c0-2-1-2-1.5-3S15 7 15 6c0-2-1-4-3-4zM9 16l-1 3-2 1M15 16l1 3 2 1M10 18l2 2 2-2' },
];

function assetInfo(platform) {
  if (!version.value?.assets) return undefined;
  return version.value.assets.find(a => a.platform === platform);
}
function fmtSize(bytes) {
  if (!bytes) return '—';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

async function loadVersion(ver) {
  loading.value = true;
  try {
    version.value = await api.getVersion(ver);
    allVersions.value = await api.getVersions();
  } catch {}
  loading.value = false;
}

onMounted(() => loadVersion(route.params.version));
watch(() => route.params.version, (v) => loadVersion(v));

const currentIdx = computed(() => {
  return allVersions.value.findIndex(v => v.version === route.params.version);
});
const prevVersion = computed(() => currentIdx.value >= 0 && currentIdx.value < allVersions.value.length - 1 ? allVersions.value[currentIdx.value + 1] : null);
const nextVersion = computed(() => currentIdx.value > 0 ? allVersions.value[currentIdx.value - 1] : null);
</script>

<template>
  <div v-if="loading" class="container" style="padding:80px 0;text-align:center;">
    <span class="meta">加载中…</span>
  </div>
  <div v-else-if="!version" class="container" style="padding:80px 0;text-align:center;">
    <span class="meta">版本不存在</span>
  </div>
  <template v-else>
    <section class="section" v-reveal style="padding-bottom:0;">
      <div class="container">
        <div class="breadcrumb">
          <router-link to="/changelog">更新日志</router-link>
          <span class="sep">/</span>
          <span class="meta num">v{{ version.version }}</span>
        </div>
        <div class="row" style="gap:16px;flex-wrap:wrap;align-items:baseline;">
          <h1>v{{ version.version }}</h1>
          <span class="pill" :class="version.channel === 'stable' ? 'stable' : 'beta'">
            <span class="status-dot" :class="{ idle: version.channel !== 'stable' }"></span>
            {{ version.channel === 'stable' ? '稳定版' : '测试版' }}
          </span>
        </div>
        <div class="ver-meta">
          <span class="meta num">{{ version.date }}</span>
          <span class="meta" style="opacity:0.4;">·</span>
          <span class="meta">三平台下载</span>
        </div>
        <p class="lead" style="margin-top:16px;">{{ version.summary }}</p>
      </div>
    </section>

    <section class="section" v-reveal style="padding-top:32px;">
      <div class="container">
        <h2>更新内容</h2>
        <ul class="note-list" v-if="version.notes && version.notes.length">
          <li v-for="(note, i) in version.notes" :key="i" class="note-item">
            <span v-if="note.tag" class="tag-mini" :class="tagClass[note.tag] || 'tag-perf'">{{ note.tag }}</span>
            <p>{{ note.text }}</p>
          </li>
        </ul>
        <p v-else class="meta">暂无更新内容</p>
      </div>
    </section>

    <section class="section" v-reveal style="padding-top:0;">
      <div class="container grid-split">
        <div>
          <p class="eyebrow">下载安装</p>
          <h2>获取这个版本</h2>
          <p class="lead" style="margin-top:16px;">选择你的平台下载对应安装包。</p>
        </div>
        <div class="stack" style="gap:12px;">
          <template v-for="p in platforms" :key="p.key">
            <a v-if="assetInfo(p.key)" class="dl-btn"
               :href="downloadUrl(version.version, p.key)">
              <svg class="dl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path :d="p.icon"/></svg>
              <span class="dl-text">
                <span class="dl-platform">{{ p.name }}</span>
                <span class="dl-meta num">{{ p.ext }} · {{ fmtSize(assetInfo(p.key)?.size) }}</span>
              </span>
            </a>
          </template>
        </div>
      </div>
    </section>

    <section class="section" v-reveal style="padding-top:0;">
      <div class="container">
        <div class="ver-nav">
          <router-link v-if="prevVersion" :to="'/version/' + prevVersion.version" class="vn-prev">
            <span class="vn-label">← 上一版本</span>
            <span class="vn-ver num">v{{ prevVersion.version }}</span>
          </router-link>
          <span v-else></span>
          <router-link v-if="nextVersion" :to="'/version/' + nextVersion.version" class="vn-next">
            <span class="vn-label">下一版本 →</span>
            <span class="vn-ver num">v{{ nextVersion.version }}</span>
          </router-link>
        </div>
      </div>
    </section>
  </template>
</template>