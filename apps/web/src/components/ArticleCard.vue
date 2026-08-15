<script setup lang="ts">
import { ref } from 'vue';
import type { ArticleSummary } from '@myblog/shared';

defineProps<{ article: ArticleSummary }>();

const PALETTE = ['#c9a66b', '#8c9e7a', '#a38bb8', '#7a9bb8', '#b8827a', '#7aa89b'];

/** 封面加载失败时回退到字符占位图 */
const coverFailed = ref(false);

function coverStyle(title: string): { background: string } {
  const hash = [...title].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return { background: PALETTE[hash % PALETTE.length] };
}

function fmtDate(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}
</script>

<template>
  <RouterLink :to="`/read/${article.slug}`" class="article-card">
    <div class="cover" :style="coverStyle(article.title)">
      <img
        v-if="article.cover && !coverFailed"
        class="cover-img"
        :src="article.cover"
        :alt="article.title"
        loading="lazy"
        @error="coverFailed = true"
      />
      <span v-else class="cover-char">{{ article.title.slice(0, 1) }}</span>
    </div>
    <div class="meta">
      <h3 class="title">{{ article.title }}</h3>
      <p class="summary">{{ article.summary || '（无摘要）' }}</p>
      <div class="tags">
        <span v-for="t in article.tags.slice(0, 3)" :key="t" class="tag">{{ t }}</span>
      </div>
      <div class="stats-line">
        <span>{{ article.wordCount }} 字</span>
        <span>· 约 {{ article.readingMinutes }} 分钟</span>
        <span>· {{ article.chapterCount }} 章</span>
        <span>· {{ fmtDate(article.publishedAt) }}</span>
      </div>
    </div>
  </RouterLink>
</template>

<style scoped>
.article-card {
  display: flex;
  gap: 16px;
  background: var(--card-bg);
  border: 1px solid var(--paper-border);
  border-radius: var(--radius);
  padding: 16px;
  box-shadow: var(--shadow);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.article-card:hover {
  transform: translateY(-2px);
  text-decoration: none;
}

.cover {
  width: 96px;
  height: 128px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  position: relative;
}

.cover-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cover-char {
  font-family: var(--font-serif);
  font-size: 34px;
  color: rgba(255, 250, 240, 0.95);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}

.meta {
  flex: 1;
  min-width: 0;
}

.title {
  margin: 2px 0 6px;
  font-family: var(--font-serif);
  font-size: 18px;
  color: var(--paper-fg);
}

.summary {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--paper-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}

.stats-line {
  font-size: 12px;
  color: var(--paper-muted);
}
</style>
