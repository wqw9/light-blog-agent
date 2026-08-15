<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ArticleDetail, ChapterView } from '@myblog/shared';
import { deleteArticle, getArticle, getChapter, reportView } from '../api/articles';
import { createAnnotation, deleteAnnotation, listAnnotations, type AnnotationView } from '../api/annotations';
import ReadingToolbar from '../components/reader/ReadingToolbar.vue';
import TocDrawer from '../components/reader/TocDrawer.vue';
import { useAdminStore } from '../stores/admin';
import { useReaderStore } from '../stores/reader';
import { useUndoStore } from '../stores/undo';

const route = useRoute();
const router = useRouter();
const reader = useReaderStore();
const undo = useUndoStore();
const admin = useAdminStore();

const article = ref<ArticleDetail | null>(null);
const chapter = ref<ChapterView | null>(null);
const tocOpen = ref(false);
const loading = ref(true);
const error = ref('');
const progress = ref(0);
const confirmingDelete = ref(false);

// ---------- 句子书注（公开书写） ----------
const annotations = ref<AnnotationView[]>([]);
const chapterBody = ref<HTMLElement | null>(null);
const selButton = ref({ show: false, x: 0, y: 0 });
const selectedText = ref('');
const annoFormOpen = ref(false);
const annoForm = ref({ quote: '', note: '', author: '' });
const annoSubmitting = ref(false);
const activeNote = ref<AnnotationView | null>(null);
const notePos = ref({ x: 0, y: 0 });

function currentAnnotations(): AnnotationView[] {
  return annotations.value.filter((a) => a.chapterIndex === chapter.value?.index);
}

async function loadAnnotations(): Promise<void> {
  if (!article.value) return;
  try {
    annotations.value = await listAnnotations(article.value.id);
    await nextTick();
    applyHighlights();
  } catch {
    annotations.value = [];
  }
}

/** 移除既有高亮（还原为纯文本），再按当前章节的书注重新包裹 */
function applyHighlights(): void {
  const root = chapterBody.value;
  if (!root) return;
  root.querySelectorAll<HTMLElement>('span.anno').forEach((el) => {
    el.replaceWith(...Array.from(el.childNodes));
  });
  const list = currentAnnotations();
  if (!list.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  for (const anno of list) {
    const q = anno.quoteText.trim();
    if (!q) continue;
    for (const node of textNodes) {
      const parent = node.parentElement;
      if (!parent || parent.closest('span.anno')) continue;
      const idx = node.textContent?.indexOf(q) ?? -1;
      if (idx < 0) continue;
      const before = node.textContent!.slice(0, idx);
      const match = node.textContent!.slice(idx, idx + q.length);
      const after = node.textContent!.slice(idx + q.length);
      const span = document.createElement('span');
      span.className = 'anno';
      span.dataset.id = String(anno.id);
      span.textContent = match;
      span.title = '查看书注';
      span.addEventListener('click', (e) => openNote(anno, e));
      const frag = document.createDocumentFragment();
      if (before) frag.append(document.createTextNode(before));
      frag.append(span);
      if (after) frag.append(document.createTextNode(after));
      node.replaceWith(frag);
      break; // 每本书注只高亮第一处出现
    }
  }
}

/** 选中文字后显示"写书注"浮动按钮 */
function onSelection(): void {
  const sel = window.getSelection();
  const text = sel?.toString().trim() ?? '';
  const root = chapterBody.value;
  if (!sel || sel.isCollapsed || !text || text.length > 300 || !root || !sel.anchorNode || !root.contains(sel.anchorNode)) {
    selButton.value.show = false;
    return;
  }
  selectedText.value = text;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  selButton.value = { show: true, x: rect.left + rect.width / 2, y: rect.top - 8 };
}

function openAnnoForm(): void {
  annoForm.value = { quote: selectedText.value, note: '', author: '' };
  annoFormOpen.value = true;
  selButton.value.show = false;
  window.getSelection()?.removeAllRanges();
}

async function submitAnno(): Promise<void> {
  if (!article.value || !chapter.value || !annoForm.value.note.trim() || annoSubmitting.value) return;
  annoSubmitting.value = true;
  try {
    await createAnnotation(article.value.id, {
      quoteText: annoForm.value.quote,
      note: annoForm.value.note.trim(),
      author: annoForm.value.author.trim() || undefined,
      chapterIndex: chapter.value.index,
    });
    annoFormOpen.value = false;
    await loadAnnotations();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '书注提交失败';
  } finally {
    annoSubmitting.value = false;
  }
}

function openNote(anno: AnnotationView, e: MouseEvent): void {
  activeNote.value = anno;
  notePos.value = { x: Math.min(e.clientX, window.innerWidth - 320), y: Math.max(60, e.clientY + 14) };
}

async function removeAnno(): Promise<void> {
  if (!activeNote.value) return;
  const id = activeNote.value.id;
  activeNote.value = null;
  try {
    await deleteAnnotation(id);
    await loadAnnotations();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除失败';
  }
}

function onDocClick(e: MouseEvent): void {
  const t = e.target as HTMLElement | null;
  if (activeNote.value && !t?.closest('.anno-pop') && !t?.closest('span.anno')) {
    activeNote.value = null;
  }
  // 注意：打开表单的按钮点击也会冒泡到这里，必须放行，否则表单刚打开就被关闭
  if (annoFormOpen.value && !t?.closest('.anno-modal') && !t?.closest('.sel-anno-btn')) {
    annoFormOpen.value = false;
  }
}

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
    await nextTick();
    applyHighlights();
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
    void loadAnnotations();
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
  document.addEventListener('mouseup', onSelection);
  document.addEventListener('click', onDocClick);
  void loadArticle();
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('mb-undo-done', onUndoDone);
  document.removeEventListener('mouseup', onSelection);
  document.removeEventListener('click', onDocClick);
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
        <img
          v-if="article?.cover"
          class="book-cover"
          :src="article.cover"
          :alt="article.title"
          @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
        />
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
            <!-- 服务端渲染的安全 HTML（html:false + 链接协议白名单）；书注高亮由脚本包裹 -->
            <div ref="chapterBody" class="chapter-body" v-html="chapter.html"></div>
            <p class="anno-hint">💬 选中任意句子即可写书注（公开可见）</p>
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

    <!-- 选中句子 → 写书注按钮 -->
    <Teleport to="body">
      <button v-if="selButton.show" class="sel-anno-btn" :style="{ left: selButton.x + 'px', top: selButton.y + 'px' }" @mousedown.prevent @click="openAnnoForm">
        💬 写书注
      </button>

      <!-- 写书注表单 -->
      <div v-if="annoFormOpen" class="anno-modal card">
        <h3>💬 写书注</h3>
        <blockquote class="anno-quote">{{ annoForm.quote }}</blockquote>
        <textarea v-model="annoForm.note" class="anno-input" rows="4" maxlength="1000" placeholder="写下你的注释、想法或补充…"></textarea>
        <input v-model="annoForm.author" class="anno-input" maxlength="30" placeholder="署名（可选）" />
        <div class="anno-actions">
          <button class="btn" @click="annoFormOpen = false">取消</button>
          <button class="btn btn-primary" :disabled="annoSubmitting || !annoForm.note.trim()" @click="submitAnno">
            {{ annoSubmitting ? '提交中…' : '发布书注' }}
          </button>
        </div>
      </div>

      <!-- 书注详情气泡 -->
      <div v-if="activeNote" class="anno-pop card" :style="{ left: notePos.x + 'px', top: notePos.y + 'px' }">
        <p class="anno-pop-quote">「{{ activeNote.quoteText }}」</p>
        <p class="anno-pop-note">{{ activeNote.note }}</p>
        <p class="anno-pop-meta">
          <template v-if="activeNote.author">— {{ activeNote.author }} · </template>
          {{ new Date(activeNote.createdAt).toLocaleString() }}
          <button v-if="admin.hasToken" class="mini danger" title="删除书注" @click="removeAnno">🗑</button>
        </p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.reader-page {
  min-height: 100vh;
  padding: 8px 0 60px;
}

/* 书注高亮与交互 */
.chapter-body :deep(span.anno) {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  border-bottom: 2px dotted var(--accent);
  cursor: pointer;
  border-radius: 3px;
  padding: 0 1px;
}

.chapter-body :deep(span.anno:hover) {
  background: color-mix(in srgb, var(--accent) 38%, transparent);
}

.anno-hint {
  margin: 22px 0 0;
  font-size: 12px;
  color: var(--paper-muted);
  text-align: center;
}

.sel-anno-btn {
  position: fixed;
  transform: translate(-50%, -100%);
  z-index: 80;
  border: 1px solid var(--accent);
  background: var(--paper-bg);
  color: var(--accent);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12.5px;
  cursor: pointer;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);
}

.anno-modal {
  position: fixed;
  z-index: 90;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 420px;
  max-width: 92vw;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
}

.anno-modal h3 {
  margin: 0;
  font-size: 15px;
}

.anno-quote {
  margin: 0;
  padding: 8px 12px;
  border-left: 3px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--paper-muted);
  font-size: 13px;
  max-height: 90px;
  overflow: auto;
}

.anno-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--paper-border);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--paper-fg);
  font-size: 13.5px;
  font-family: inherit;
  resize: vertical;
}

.anno-input:focus {
  outline: none;
  border-color: var(--accent);
}

.anno-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.anno-pop {
  position: fixed;
  z-index: 85;
  width: 300px;
  padding: 12px 14px;
}

.anno-pop-quote {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--paper-muted);
  border-left: 3px solid var(--accent);
  padding-left: 8px;
}

.anno-pop-note {
  margin: 0 0 6px;
  font-size: 13.5px;
  white-space: pre-wrap;
  word-break: break-word;
}

.anno-pop-meta {
  margin: 0;
  font-size: 11.5px;
  color: var(--paper-muted);
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: space-between;
}

.book-header {
  max-width: 760px;
  margin: 26px auto 8px;
  padding: 0 20px;
  text-align: center;
}

.book-cover {
  display: block;
  margin: 0 auto 12px;
  max-width: 180px;
  max-height: 240px;
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
  object-fit: cover;
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
