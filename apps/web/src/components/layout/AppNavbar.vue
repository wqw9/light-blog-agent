<script setup lang="ts">
import { computed } from 'vue';
import { useSiteStore } from '../../stores/site';

const site = useSiteStore();

const FALLBACK_NAV = [
  { label: '首页', path: '/' },
  { label: '书架', path: '/shelf' },
  { label: '归档', path: '/archive' },
];

const nav = computed(() => (site.nav?.length ? site.nav : FALLBACK_NAV));
</script>

<template>
  <header class="app-navbar">
    <RouterLink to="/" class="brand">{{ site.name || '拾页书阁' }}</RouterLink>
    <nav>
      <RouterLink v-for="item in nav" :key="item.path" :to="item.path">{{ item.label }}</RouterLink>
    </nav>
  </header>
</template>
