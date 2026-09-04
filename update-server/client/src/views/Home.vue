<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api';

const latest = ref(null);

onMounted(async () => {
  try { latest.value = await api.getLatest(); } catch {}
});
</script>

<template>
  <section class="hero container" v-reveal>
    <p class="eyebrow">LX-DSH · 桌面控制台</p>
    <h1>一个干净利落的系统管理工具。</h1>
    <p class="lead">实时监控、智能优化、静默更新——LX-DSH 把系统管理收进一个界面，从不打断你的工作。</p>
    <div class="hero-cta" style="display:flex;gap:12px;justify-content:center;margin-top:32px;">
      <router-link class="btn btn-primary" to="/download">免费下载</router-link>
      <router-link class="btn btn-ghost btn-arrow" to="/changelog">更新日志</router-link>
    </div>
    <p v-if="latest" class="meta" style="margin-top:20px;">当前版本 v{{ latest.version }} · {{ latest.date }}</p>

    <div class="cards">
      <router-link class="link-card" to="/download">
        <h2>下载<span class="arrow">→</span></h2>
        <p>Windows、macOS、Linux 三平台安装包，自动检测你的系统并推荐对应版本。</p>
        <span class="lc-tag meta">三平台 · 系统要求 · 安装指南</span>
      </router-link>
      <router-link class="link-card" to="/changelog">
        <h2>更新日志<span class="arrow">→</span></h2>
        <p>完整的版本历史。点击任意版本查看详情与下载。</p>
        <span class="lc-tag meta">版本历史 · 变更明细</span>
      </router-link>
    </div>
  </section>
</template>
