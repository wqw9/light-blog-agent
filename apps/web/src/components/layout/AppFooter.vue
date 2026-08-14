<script setup lang="ts">
import { useSiteStore } from '../../stores/site';

const site = useSiteStore();
const year = new Date().getFullYear();
</script>

<template>
  <footer class="app-footer">© {{ year }} {{ site.name }} · 用 Markdown 装订的书页</footer>
</template>
