<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ArticleSummary } from '@myblog/shared';
import { listArticles } from '../api/articles';
import ArticleCard from '../components/ArticleCard.vue';
import { useSiteStore } from '../stores/site';

const site = useSiteStore();
const articles = ref<ArticleSummary[]>([]);
const loading = ref(true);

onMounted(async () => {
  await site.load();
  try {
    const res = await listArticles({ pageSize: 5 });
    articles.value = res.items;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="container home">
    <section class="hero card">
      <h1>{{ site.name }}</h1>
      <p class="signature">{{ site.signature }}</p>
      <p class="desc">{{ site.description }}</p>
      <div class="hero-actions">
        <RouterLink to="/shelf" class="btn btn-primary">📚 去书架阅读</RouterLink>
        <RouterLink to="/shelf" class="btn">📥 上传文章</RouterLink>
      </div>
    </section>

    <section class="recent">
      <div class="section-head">
        <h2>最近更新</h2>
        <RouterLink to="/shelf">全部 →</RouterLink>
      </div>
      <p v-if="loading" class="empty">加载中…</p>
      <div v-else-if="articles.length" class="recent-list">
        <ArticleCard v-for="a in articles" :key="a.id" :article="a" />
      </div>
      <p v-else class="empty">书架上还是空的 —— 打开书架页，拖一篇 Markdown 进来吧。</p>
    </section>
  </div>
</template>

<style scoped>
.hero {
  text-align: center;
  padding: 56px 24px 44px;
}

.hero h1 {
  margin: 0 0 10px;
  font-family: var(--font-serif);
  font-size: 44px;
  letter-spacing: 6px;
}

.signature {
  font-family: var(--font-serif);
  font-size: 17px;
  color: var(--accent);
  margin: 0 0 10px;
}

.desc {
  color: var(--paper-muted);
  font-size: 14px;
  margin: 0 0 26px;
}

.hero-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.recent {
  margin-top: 32px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 14px;
}

.section-head h2 {
  font-family: var(--font-serif);
  margin: 0;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.empty {
  color: var(--paper-muted);
  text-align: center;
  padding: 40px 0;
}
</style>
