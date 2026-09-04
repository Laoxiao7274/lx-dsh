import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './assets/design-system.css';

import Home from './views/Home.vue';
import Download from './views/Download.vue';
import Changelog from './views/Changelog.vue';
import VersionDetail from './views/VersionDetail.vue';
import AdminLogin from './views/AdminLogin.vue';
import AdminPanel from './views/AdminPanel.vue';

const routes = [
  { path: '/', component: Home },
  { path: '/download', component: Download },
  { path: '/changelog', component: Changelog },
  { path: '/version/:version', component: VersionDetail, props: true },
  { path: '/admin/login', component: AdminLogin },
  { path: '/admin', component: AdminPanel, meta: { requiresAuth: true } },
];

const router = createRouter({ history: createWebHistory(), routes, scrollBehavior() { return { top: 0 }; } });

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !localStorage.getItem('admin_token')) {
    return '/admin/login';
  }
});

// scroll reveal directive
const app = createApp(App);
app.directive('reveal', {
  mounted(el) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in-view'); obs.unobserve(e.target); } });
    }, { threshold: 0.08 });
    obs.observe(el);
  }
});
app.use(router);
app.mount('#app');
