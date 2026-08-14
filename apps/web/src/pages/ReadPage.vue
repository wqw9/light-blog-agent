<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ArticleDetail, ChapterView } from '@myblog/shared';
import { deleteArticle, getArticle, getChapter, reportView } from '../api/articles';
import ReadingToolbar from '../components/reader/ReadingToolbar.vue';
import TocDrawer from '../components/reader/TocDrawer.vue';
import { useReaderStore } from '../stores/reader';
import { useUndoStore } from '../stores/undo';

const route = useRoute();
const router = useRouter();
const reader = useReaderStore();
const undo = useUndoStore();

const article = ref<ArticleDetail | null>(null);
const chapter = ref<ChapterView | null>(null);
const tocOpen = ref(false);
const loading = ref(true);
const error = ref('');
const progress = ref(0);
const confirmingDelete = ref(false);

// ---------- 删除（两步确认，401 时自动弹管理口令框；成功后支持 Ctrl+Z 撤销） ----------
async function doDelete(): Promise<void> {
  if (!article.value) return;
  const id = article.value.id;
  const title = article.value.title;
  try {
    await deleteArticle(id);
    undo.pushOp({ articleId: id, title, action: '删除', at: Date.now() });
    void router.push('/shelf');
  } catch (err) {
    confirmingDelete.value = false;
    error.value = err instanceof Error ? err.message : '删除失败';
  }
}

/** 撤销完成 → 重新加载当前文章 */
function onUndoDone(): void {
  void loadArticle();
}

/** 打开知识问答并预设问题（AI 整理的"可以问这篇文章"） */
function askQuestion(question: string): void {
  window.dispatchEvent(new CustomEvent('mb-ask', { detail: { question } }));
}

// ---------- 断点续读（设计文档 5.7.4：localStorage 记录章节与进度） ----------
const PROGRESS_KEY = 'mb-reading-progress';

interface SavedProgress {
  [slug: string]: { chapterIndex: number; scrollPct: number };
}

function readProgress(): SavedProgress {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}') as SavedProgress;
  } catch {
    return {};
  }
}

function saveProgress(): void {
  if (!article.value || !chapter.value) return;
  const all = readProgress();
  all[article.value.slug] = { chapterIndex: chapter.value.index, scrollPct: progress.value };
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

// ---------- 章节加载 ----------
async function go(index: number | null | undefined): Promise<void> {
  if (!article.value || index == null) return;
  loading.value = true;
  try {
    chapter.value = await getChapter(article.value.id, index);
    progress.value = 0;
    window.scrollTo({ top: 0 });
  } catch (err) {
    error.value = err instanceof Error ? err.message : '章节加载失败';
  } finally {
    loading.value = false;
  }
}

async function loadArticle(): Promise<void> {
  const slug = String(route.params.slug ?? '');
  error.value = '';
  loading.value = true;
  article.value = null;
  chapter.value = null;
  try {
    article.value = await getArticle(slug);
    void reportView(slug);
    const saved = readProgress()[slug];
    const first = article.value.chapters[0]?.index ?? 1;
    await go(saved?.chapterIndex ?? first);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败';
    loading.value = false;
  }
}

// ---------- 阅读进度条（顶部细条，当前章节滚动百分比） ----------
function onScroll(): void {
  const doc = document.documentElement;
  const max = doc.scrollHeight - doc.clientHeight;
  progress.value = max > 0 ? Math.min(1, doc.scrollTop / max) : 0;
  saveProgressThrottled();
}

let throttleTimer: number | undefined;
function saveProgressThrottled(): void {
  if (throttleTimer) return;
  throttleTimer = window.setTimeout(() => {
    throttleTimer = undefined;
    saveProgress();
  }, 1500);
}

// ---------- 快捷键（设计文档 5.7.4） ----------
function onKeydown(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    void go(chapter.value?.nextIndex);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    void go(chapter.value?.prevIndex);
  } else if (e.key === 't' || e.key === 'T') {
    tocOpen.value = !tocOpen.value;
  } else if (e.key === 'f' || e.key === 'F') {
    reader.toggleImmersive();
  }
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('mb-undo-done', onUndoDone);
  void loadArticle();
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('mb-undo-done', onUndoDone);
  saveProgress();
  reader.setImmersive(false);
});

watch(
  () => route.params.slug,
  () => void loadArticle(),
);
</script>

<template>
  <div class="reader-page">
    <ReadingToolbar @toggle-toc="tocOpen = !tocOpen" />

    <div v-if="error" class="error card">{{ error }}</div>
    <template v-else>
      <header class="book-header">
        <h1 class="book-title">{{ article?.title }}</h1>
        <p v-if="article" class="book-meta">
          {{ article.tags.join(' · ') }} · {{ article.wordCount }} 字 · 约 {{ article.readingMinutes }} 分钟 ·
          {{ article.chapterCount }} 章
        </p>
        <div v-if="article" class="book-actions">
          <RouterLink :to="`/manage?edit=${article.slug}`" class="btn mini">✏️ 编辑</RouterLink>
          <template v-if="confirmingDelete">
            <button class="btn mini danger" @click="doDelete">确认删除</button>
            <button class="btn mini" @click="confirmingDelete = false">取消</button>
          </template>
          <button v-else class="btn mini" @click="confirmingDelete = true">🗑 删除</button>
        </div>
        <div v-if="article?.questions?.length" class="book-questions">
          <span class="q-label">💬 可以问这篇文章：</span>
          <button
            v-for="q in article.questions"
            :key="q"
            class="q-chip"
            title="打开知识问答"
            @click="askQuestion(q)"
          >
            {{ q }}
          </button>
        </div>
      </header>

      <div class="paper" :style="{ fontSize: reader.fontSize + 'px' }">
        <p v-if="loading" class="loading">翻页中…</p>
        <template v-else-if="chapter">
          <article class="chapter">
            <h2 class="chapter-title">{{ chapter.index }} · {{ chapter.title }}</h2>
            <!-- 服务端渲染的安全 HTML（html:false + 链接协议白名单） -->
            <div class="chapter-body" v-html="chapter.html"></div>
          </article>
          <nav class="chapter-nav">
            <button class="btn" :disabled="chapter.prevIndex == null" @click="go(chapter.prevIndex)">← 上一章</button>
            <span class="pos">{{ chapter.index }} / {{ chapter.chapterCount }}</span>
            <button class="btn" :disabled="chapter.nextIndex == null" @click="go(chapter.nextIndex)">下一章 →</button>
          </nav>
        </template>
      </div>
    </template>

    <div class="reading-progress" :style="{ width: progress * 100 + '%' }"></div>
    <TocDrawer
      :open="tocOpen"
      :article="article"
      :chapter="chapter"
      @close="tocOpen = false"
      @select-chapter="(i: number) => { tocOpen = false; go(i); }"
    />
  </div>
</template>

<style scoped>
.reader-page {
  min-height: 100vh;
  padding: 8px 0 60px;
}

.book-header {
  max-width: 760px;
  margin: 26px auto 8px;
  padding: 0 20px;
  text-align: center;
}

.book-title {
  margin: 0 0 6px;
  font-family: var(--font-serif);
  font-size: 26px;
  letter-spacing: 2px;
}

.book-meta {
  margin: 0;
  font-size: 12.5px;
  color: var(--paper-muted);
}

.book-actions {
  margin-top: 12px;
  display: flex;
  justify-content: center;
  gap: 8px;
}

.book-questions {
  margin-top: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.q-label {
  font-size: 12px;
  color: var(--paper-muted);
}

.q-chip {
  border: 1px solid var(--paper-border);
  background: transparent;
  color: var(--paper-fg);
  border-radius: 999px;
  padding: 3px 12px;
  font-size: 12px;
  transition: all 0.15s ease;
}

.q-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.btn.mini {
  padding: 4px 12px;
  font-size: 12.5px;
}

.btn.mini.danger:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.loading {
  text-align: center;
  color: var(--paper-muted);
  padding: 60px 0;
}

.chapter-title {
  font-size: 1.45em;
  margin: 0 0 1.4em;
  text-align: center;
  letter-spacing: 1px;
}

.chapter-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 48px;
  padding-top: 20px;
  border-top: 1px solid var(--paper-border);
}

.pos {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--paper-muted);
}

.reading-progress {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  background: var(--accent);
  z-index: 80;
  transition: width 0.1s linear;
}

.error {
  max-width: 560px;
  margin: 60px auto;
  padding: 26px;
  text-align: center;
  color: var(--danger);
}
</style>
