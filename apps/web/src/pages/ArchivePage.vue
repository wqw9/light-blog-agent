<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ArticleSummary } from '@myblog/shared';
import { listArticles } from '../api/articles';

interface Group {
  label: string;
  items: ArticleSummary[];
}

const groups = ref<Group[]>([]);

onMounted(async () => {
  const res = await listArticles({ pageSize: 50 });
  const map = new Map<string, ArticleSummary[]>();
  for (const a of res.items) {
    const key = (a.publishedAt ?? a.createdAt).slice(0, 7);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  groups.value = [...map.entries()].map(([label, items]) => ({ label, items }));
});
</script>

<template>
  <div class="container archive">
    <h2 class="page-title">归档</h2>
    <section v-for="g in groups" :key="g.label" class="group card">
      <h3 class="group-label">{{ g.label }}</h3>
      <ul>
        <li v-for="a in g.items" :key="a.id">
          <RouterLink :to="`/read/${a.slug}`">{{ a.title }}</RouterLink>
          <span class="meta">{{ a.wordCount }} 字 · {{ a.chapterCount }} 章 · {{ a.viewCount }} 阅读</span>
        </li>
      </ul>
    </section>
    <p v-if="!groups.length" class="empty">还没有归档内容。</p>
  </div>
</template>

<style scoped>
.page-title {
  font-family: var(--font-serif);
  margin: 0 0 18px;
}

.group {
  padding: 18px 22px;
  margin-bottom: 18px;
}

.group-label {
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--accent);
  margin: 0 0 8px;
}

.group ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.group li {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--paper-border);
  font-size: 14px;
}

.group li:last-child {
  border-bottom: none;
}

.meta {
  color: var(--paper-muted);
  font-size: 12px;
  white-space: nowrap;
}

.empty {
  color: var(--paper-muted);
  text-align: center;
  padding: 48px 0;
}
</style>
