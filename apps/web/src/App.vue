<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import AboutBubble from './components/about/AboutBubble.vue';
import AdminPasswordModal from './components/admin/AdminPasswordModal.vue';
import ChatPanel from './components/chat/ChatPanel.vue';
import AppFooter from './components/layout/AppFooter.vue';
import AppNavbar from './components/layout/AppNavbar.vue';
import MascotHost from './components/mascot/MascotHost.vue';
import UndoChip from './components/undo/UndoChip.vue';
import { useReaderStore } from './stores/reader';
import { useSiteStore } from './stores/site';
import { useUndoStore } from './stores/undo';

const site = useSiteStore();
const reader = useReaderStore();
const undo = useUndoStore();

/** 全局 Ctrl+Z：撤销最近一次文章操作（输入框/文本域内交给原生撤销） */
function onKeydown(e: KeyboardEvent): void {
  if (!(e.ctrlKey && (e.key === 'z' || e.key === 'Z'))) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  e.preventDefault();
  void undo.performUndo();
}

onMounted(() => {
  void site.load();
  reader.applyTheme();
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="app-shell">
    <AppNavbar />
    <main class="app-main"><RouterView /></main>
    <AppFooter />
    <AboutBubble />
    <ChatPanel />
    <UndoChip />
    <MascotHost />
    <AdminPasswordModal />
  </div>
</template>
