<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useSiteStore } from '../../stores/site';

const site = useSiteStore();
const route = useRoute();

const FALLBACK_NAV = [
  { label: '首页', path: '/' },
  { label: '书架', path: '/shelf' },
  { label: '归档', path: '/archive' },
  { label: '友链', path: '/friends' },
];

const nav = computed(() => (site.nav?.length ? site.nav : FALLBACK_NAV));

/** 移动端折叠菜单（≤760px 时由汉堡按钮控制，样式见 styles/base.css） */
const menuOpen = ref(false);

function closeMenu(): void {
  menuOpen.value = false;
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeMenu();
}

// 路由变化后自动收起，避免跳转后菜单仍挡着正文
watch(() => route.fullPath, closeMenu);

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <header class="app-navbar">
    <RouterLink to="/" class="brand" @click="closeMenu">{{ site.name || '拾页书阁' }}</RouterLink>
    <nav class="nav-links" :class="{ open: menuOpen }">
      <RouterLink v-for="item in nav" :key="item.path" :to="item.path" @click="closeMenu">{{ item.label }}</RouterLink>
    </nav>
    <button
      class="nav-toggle"
      :class="{ active: menuOpen }"
      :aria-expanded="menuOpen"
      aria-label="导航菜单"
      title="导航菜单"
      @click="menuOpen = !menuOpen"
    >
      {{ menuOpen ? '✕' : '☰' }}
    </button>
  </header>
</template>
