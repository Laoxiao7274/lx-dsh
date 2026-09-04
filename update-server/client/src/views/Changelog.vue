<script setup>
import { ref, onMounted, computed } from 'vue';
import { api } from '../api';

const versions = ref([]);
const filter = ref('all');

onMounted(async () => {
  versions.value = await api.getVersions();
});

const filtered = computed(() => {
  if (filter.value === 'all') return versions.value;
  return versions.value.filter(v => v.channel === filter.value);
});

const tagClass = { '新增': 'tag-new', '优化': 'tag-perf', '修复': 'tag-fix' };
</script>

<template>
  <section class="section hero" v-reveal>
    <div class="container hero-center">
      <p class="eyebrow">更新日志</p>
      <h1>每一次发布，都记录在案。</h1>
      <p class="lead">LX-DSH 的完整版本历史。筛选通道查看稳定版或测试版的全部发布记录。</p>
    </div>
  </section>

  <section class="section" v-reveal style="padding-top:0;">
    <div class="container">
      <div class="filter-bar">
        <div class="filter-group">
          <button class="filter-btn" :class="{active: filter==='all'}" @click="filter='all'">全部</button>
          <button class="filter-btn" :class="{active: filter==='stable'}" @click="filter='stable'">稳定版</button>
          <button class="filter-btn" :class="{active: filter==='beta'}" @click="filter='beta'">测试版</button>
        </div>
        <span class="meta">共 {{ filtered.length }} 个版本</span>
      </div>

      <div v-if="filtered.length === 0" class="meta" style="text-align:center;padding:60px 0;">暂无版本</div>

      <article v-for="v in filtered" :key="v.id" class="release" :data-channel="v.channel">
        <div class="release-head">
          <div class="rh-left" style="display:flex;align-items:center;gap:16px;">
            <h3>
              <router-link :to="'/version/' + v.version">v{{ v.version }}<span class="rh-chevron">→</span></router-link>
            </h3>
            <span class="rh-date num">{{ v.date }}</span>
          </div>
          <span class="pill" :class="v.channel === 'stable' ? 'stable' : 'beta'">
            <span class="status-dot" :class="{ idle: v.channel !== 'stable' }"></span>
            {{ v.channel === 'stable' ? '稳定版' : '测试版' }}
          </span>
        </div>
        <div class="release-body">
          <p>{{ v.summary }}</p>
          <ul v-if="v.notes && v.notes.length">
            <li v-for="(note, i) in v.notes" :key="i">
              <span v-if="note.tag" class="tag-mini" :class="tagClass[note.tag] || 'tag-perf'">{{ note.tag }}</span>
              {{ note.text }}
            </li>
          </ul>
        </div>
      </article>
    </div>
  </section>
</template>
