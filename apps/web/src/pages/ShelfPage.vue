<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ArticleSummary, UploadResultItem } from '@myblog/shared';
import { listArticles, listTags } from '../api/articles';
import ArticleCard from '../components/ArticleCard.vue';
import UploadDropzone from '../components/upload/UploadDropzone.vue';

const articles = ref<ArticleSummary[]>([]);
const total = ref(0); // 当前筛选结果数量
const allTotal = ref(0); // 全部文章总数（不随筛选变化）
const tags = ref<{ name: string; color: string | null; count: number }[]>([]);
const activeTag = ref('');
const loading = ref(true);

const PAGE_SIZE = 12;

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await listArticles({ tag: activeTag.value || undefined, pageSize: PAGE_SIZE });
    articles.value = res.items;
    total.value = res.total;
    if (!activeTag.value) allTotal.value = res.total; // 无筛选时同步总数
  } finally {
    loading.value = false;
  }
}

async function loadAllTotal(): Promise<void> {
  try {
    const res = await listArticles({ pageSize: 1 });
    allTotal.value = res.total;
  } catch {
    /* ignore */
  }
}

async function loadTags(): Promise<void> {
  try {
    tags.value = await listTags();
  } catch {
    tags.value = [];
  }
}

function onUploaded(results: UploadResultItem[]): void {
  if (results.some((r) => r.ok && r.article)) {
    void load();
    void loadAllTotal();
    void loadTags();
  }
}

const hasMore = computed(() => articles.value.length < total.value);

onMounted(() => {
  void load();
  void loadAllTotal();
  void loadTags();
});
</script>

<template>
  <div class="container shelf">
    <UploadDropzone @uploaded="onUploaded" />

    <div class="filters">
      <button class="tag-chip" :class="{ active: !activeTag }" @click="activeTag = ''; load()">全部 ({{ allTotal }})</button>
      <button
        v-for="t in tags"
        :key="t.name"
        class="tag-chip"
        :class="{ active: activeTag === t.name }"
        @click="activeTag = t.name; load()"
      >
        {{ t.name }} ({{ t.count }})
      </button>
    </div>

    <!-- 当前筛选结果计数 -->
    <p v-if="activeTag && !loading" class="filter-line">
      📚 标签「{{ activeTag }}」下共 <b>{{ total }}</b> 篇（当前显示前 {{ Math.min(total, PAGE_SIZE) }} 篇）
    </p>

    <p v-if="loading" class="empty">加载中…</p>
    <div v-else-if="articles.length" class="shelf-grid">
      <ArticleCard v-for="a in articles" :key="a.id" :article="a" />
    </div>
    <p v-else class="empty">书架空空如也，拖一篇 Markdown 到上方区域吧。</p>

    <div v-if="hasMore" class="load-more">
      <span class="btn">更多文章敬请期待分页（当前显示前 {{ PAGE_SIZE }} 篇）</span>
    </div>
  </div>
</template>

<style scoped>
.shelf {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tag-chip {
  border: 1px solid var(--paper-border);
  background: var(--card-bg);
  color: var(--paper-fg);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 13px;
}

.tag-chip.active {
  background: var(--accent);
  color: #fdf8ee;
  border-color: var(--accent);
}

.filter-line {
  margin: -8px 0 0;
  font-size: 13px;
  color: var(--paper-muted);
}

.filter-line b {
  color: var(--accent);
}

.shelf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.empty {
  color: var(--paper-muted);
  text-align: center;
  padding: 48px 0;
}

.load-more {
  text-align: center;
}

.load-more .btn {
  cursor: default;
}
</style>
