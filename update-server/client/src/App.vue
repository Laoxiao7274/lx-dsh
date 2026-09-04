<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const navOpen = ref(false);
const isAdmin = ref(route.path.startsWith('/admin'));

watch(() => route.path, (p) => {
  isAdmin.value = p.startsWith('/admin');
  navOpen.value = false;
});

function toggleNav() { navOpen.value = !navOpen.value; }
</script>

<template>
  <div id="app-root">
    <!-- 公开站点的导航 -->
    <header class="topnav" v-if="!isAdmin">
      <div class="container topnav-inner">
        <router-link class="logo" to="/"><span class="mark" aria-hidden="true"></span>LX-DSH</router-link>
        <nav>
          <router-link to="/download">下载</router-link>
          <router-link to="/changelog">更新日志</router-link>
        </nav>
        <router-link class="btn btn-secondary btn-arrow btn-nav-desktop" to="/download">下载</router-link>
        <button class="nav-toggle" @click="toggleNav" :aria-expanded="navOpen">
          <span></span><span></span><span></span>
        </button>
      </div>
      <div class="nav-mobile" :class="{ open: navOpen }">
        <router-link to="/download">下载</router-link>
        <router-link to="/changelog">更新日志</router-link>
      </div>
    </header>

    <main>
      <router-view />
    </main>

    <footer class="pagefoot" v-if="!isAdmin">
      <div class="container row-between">
        <span>© 2026 LX-DSH</span>
        <span class="meta">更新服务 · v1.0</span>
      </div>
    </footer>
  </div>
</template>
