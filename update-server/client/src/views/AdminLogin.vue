<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function login() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.login(username.value, password.value);
    localStorage.setItem('admin_token', res.token);
    router.push('/admin');
  } catch (e) {
    error.value = e.message;
  }
  loading.value = false;
}
</script>

<template>
  <div style="min-height:100vh;display:grid;place-items:center;padding:20px;">
    <div style="width:100%;max-width:360px;">
      <div style="text-align:center;margin-bottom:32px;">
        <span class="logo" style="justify-content:center;"><span class="mark"></span>LX-DSH</span>
        <p class="meta" style="margin-top:8px;">更新服务管理后台</p>
      </div>
      <form @submit.prevent="login" class="stack" style="gap:16px;">
        <input v-model="username" type="text" placeholder="用户名"
          style="width:100%;padding:12px 16px;border:1px solid var(--border);border-radius:var(--radius);font-size:15px;outline:none;background:var(--surface);"
          autocomplete="username" />
        <input v-model="password" type="password" placeholder="密码"
          style="width:100%;padding:12px 16px;border:1px solid var(--border);border-radius:var(--radius);font-size:15px;outline:none;background:var(--surface);"
          autocomplete="current-password" />
        <p v-if="error" style="color:var(--danger);font-size:14px;margin:0;">{{ error }}</p>
        <button type="submit" class="btn btn-primary" :disabled="loading" style="width:100%;">
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>
