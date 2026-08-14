<script setup lang="ts">
import type { ArticleDetail, ChapterView } from '@myblog/shared';

defineProps<{ open: boolean; article: ArticleDetail | null; chapter: ChapterView | null }>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select-chapter', index: number): void;
}>();

function jumpToHeading(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="toc-backdrop" @click="$emit('close')"></div>
    <aside class="toc-drawer" :class="{ open }">
      <div class="toc-head">
        <h3>章节目录</h3>
        <button class="close" title="关闭" @click="$emit('close')">✕</button>
      </div>
      <ol class="chapter-list">
        <li
          v-for="c in article?.chapters ?? []"
          :key="c.index"
          :class="{ current: c.index === chapter?.index }"
          @click="emit('select-chapter', c.index)"
        >
          <span class="idx">{{ c.index }}</span>{{ c.title }}
        </li>
      </ol>
      <div v-if="(chapter?.toc ?? []).length" class="toc-head sub">
        <h4>本章标题</h4>
      </div>
      <ul class="heading-list">
        <li
          v-for="h in chapter?.toc ?? []"
          :key="h.id"
          :style="{ paddingLeft: (h.level - 1) * 12 + 'px' }"
          @click="jumpToHeading(h.id)"
        >
          {{ h.text }}
        </li>
      </ul>
    </aside>
  </Teleport>
</template>

<style scoped>
.toc-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  z-index: 60;
}

.toc-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 300px;
  max-width: 86vw;
  background: var(--card-bg);
  border-left: 1px solid var(--paper-border);
  z-index: 61;
  transform: translateX(100%);
  transition: transform 0.25s ease;
  overflow-y: auto;
  padding: 18px;
}

.toc-drawer.open {
  transform: translateX(0);
}

.toc-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.toc-head h3,
.toc-head h4 {
  margin: 0;
  font-family: var(--font-serif);
}

.toc-head.sub {
  margin-top: 18px;
}

.close {
  border: none;
  background: transparent;
  font-size: 16px;
  color: var(--paper-muted);
}

.chapter-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.chapter-list li {
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 9px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.chapter-list li:hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.chapter-list li.current {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
  font-weight: 600;
}

.chapter-list .idx {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--paper-muted);
}

.heading-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.heading-list li {
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--paper-muted);
}

.heading-list li:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}
</style>
