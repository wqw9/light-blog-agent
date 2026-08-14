<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAdminStore } from '../../stores/admin';

const admin = useAdminStore();
const password = ref('');

watch(
  () => admin.dialogOpen,
  (open) => {
    if (open) password.value = '';
  },
);

function submit(): void {
  if (!password.value) return;
  admin.submit(password.value);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="admin.dialogOpen" class="pw-backdrop" @click.self="admin.cancel()">
      <div class="pw-card card">
        <h3>🔐 需要管理口令</h3>
        <p class="hint">发布、编辑、删除等管理操作需要口令（在 config/admin.json 中配置）</p>
        <input
          v-model="password"
          type="password"
          class="pw-input"
          placeholder="管理口令"
          autofocus
          @keydown.enter="submit"
        />
        <p v-if="admin.error" class="err">{{ admin.error }}</p>
        <div class="actions">
          <button class="btn" @click="admin.cancel()">取消</button>
          <button class="btn btn-primary" :disabled="!password" @click="submit">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pw-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.pw-card {
  width: 340px;
  max-width: 92vw;
  padding: 24px 26px;
}

.pw-card h3 {
  margin: 0 0 8px;
  font-family: var(--font-serif);
}

.hint {
  margin: 0 0 14px;
  font-size: 12.5px;
  color: var(--paper-muted);
  line-height: 1.6;
}

.pw-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--paper-border);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--paper-fg);
  font-size: 14px;
}

.pw-input:focus {
  outline: none;
  border-color: var(--accent);
}

.err {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--danger);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}
</style>
