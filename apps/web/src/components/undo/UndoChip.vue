<script setup lang="ts">
import { useUndoStore } from '../../stores/undo';

const undo = useUndoStore();
</script>

<template>
  <Teleport to="body">
    <!-- 撤销悬浮条：最近一次操作后出现，12 秒自动收起 -->
    <div v-if="undo.chipOpen && undo.lastOp" class="undo-chip card">
      <span class="op-text">{{ undo.lastOp.action }}《{{ undo.lastOp.title }}》</span>
      <button class="btn mini" @click="undo.performUndo()">↩ 撤销</button>
      <span class="kbd">Ctrl+Z</span>
      <button class="close" title="收起" @click="undo.chipOpen = false">✕</button>
    </div>

    <!-- 撤销成功提示 -->
    <div v-if="undo.toast" class="undo-toast card">{{ undo.toast }}</div>
  </Teleport>
</template>

<style scoped>
.undo-chip {
  position: fixed;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  z-index: 70;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  font-size: 13px;
}

.op-text {
  color: var(--paper-fg);
}

.btn.mini {
  padding: 4px 12px;
  font-size: 12.5px;
}

.kbd {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--paper-muted);
  border: 1px solid var(--paper-border);
  border-radius: 4px;
  padding: 1px 6px;
}

.close {
  border: none;
  background: transparent;
  color: var(--paper-muted);
  font-size: 13px;
}

.undo-toast {
  position: fixed;
  left: 50%;
  bottom: 74px;
  transform: translateX(-50%);
  z-index: 70;
  padding: 8px 18px;
  font-size: 13px;
  color: var(--success);
}
</style>
