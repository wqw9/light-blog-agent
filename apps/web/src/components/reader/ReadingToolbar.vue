<script setup lang="ts">
import type { ThemeId } from '../../stores/reader';
import { useReaderStore } from '../../stores/reader';

defineEmits<{ (e: 'toggle-toc'): void }>();

const reader = useReaderStore();

function onThemeChange(event: Event): void {
  reader.setTheme((event.target as HTMLSelectElement).value as ThemeId);
}
</script>

<template>
  <div class="toolbar card">
    <button class="tbtn" title="减小字号" :disabled="reader.fontIndex <= 0" @click="reader.decreaseFont()">A-</button>
    <button class="tbtn" title="增大字号" :disabled="reader.fontIndex >= 3" @click="reader.increaseFont()">A+</button>
    <label class="theme-pick" title="纸张主题">
      <select :value="reader.theme" @change="onThemeChange">
        <option v-for="t in reader.themeList" :key="t.id" :value="t.id">{{ t.label }}</option>
      </select>
    </label>
    <button class="tbtn" title="目录 (T)" @click="$emit('toggle-toc')">☰ 目录</button>
    <button class="tbtn" :title="reader.immersive ? '退出沉浸 (F)' : '沉浸模式 (F)'" @click="reader.toggleImmersive()">
      {{ reader.immersive ? '⛶ 退出沉浸' : '⛶ 沉浸' }}
    </button>
  </div>
</template>

<style scoped>
.toolbar {
  position: fixed;
  right: 18px;
  top: 72px;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
}

.tbtn {
  border: 1px solid var(--paper-border);
  background: transparent;
  color: var(--paper-fg);
  border-radius: 6px;
  padding: 5px 9px;
  font-size: 13px;
}

.tbtn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.tbtn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.theme-pick select {
  border: 1px solid var(--paper-border);
  background: var(--input-bg);
  color: var(--paper-fg);
  border-radius: 6px;
  padding: 5px 6px;
  font-size: 13px;
}
</style>
