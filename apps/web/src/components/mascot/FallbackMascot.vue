<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

defineProps<{ scale?: number }>();

const bubble = ref('');
const sleeping = ref(false);

const TIPS = ['和我聊聊吧，点我提问 💬', '把 Markdown 拖进书架就能出版哦', 'Ctrl+Z 可以撤销刚才的操作', '按 A 键看看自我介绍吧'];

let timer: number | undefined;
let sleepTimer: number | undefined;

function poke(): void {
  sleeping.value = false;
  bubble.value = TIPS[Math.floor(Math.random() * TIPS.length)];
  // 交流功能：点击小人打开知识问答面板
  window.dispatchEvent(new CustomEvent('mb-chat-open'));
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    bubble.value = '';
  }, 3200);
  if (sleepTimer) window.clearTimeout(sleepTimer);
  sleepTimer = window.setTimeout(() => {
    sleeping.value = true;
  }, 300000);
}

onMounted(() => {
  sleepTimer = window.setTimeout(() => {
    sleeping.value = true;
  }, 300000);
});

onBeforeUnmount(() => {
  if (timer) window.clearTimeout(timer);
  if (sleepTimer) window.clearTimeout(sleepTimer);
});
</script>

<template>
  <div class="fb-wrap" :style="{ transform: `scale(${scale ?? 1})` }">
    <div class="fb" :class="{ sleeping }" @click="poke">
    <div v-if="bubble" class="fb-bubble card">{{ bubble }}</div>
    <div class="fb-body">
      <div class="fb-ear left"></div>
      <div class="fb-ear right"></div>
      <div class="fb-face">
        <span class="eye l" :class="{ closed: sleeping }"></span>
        <span class="eye r" :class="{ closed: sleeping }"></span>
        <span class="mouth" :class="{ closed: sleeping }"></span>
      </div>
      <div class="fb-feet">
        <span></span><span></span>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.fb-wrap {
  position: fixed;
  left: 18px;
  bottom: 18px;
  z-index: 53;
  transform-origin: bottom left;
}

.fb {
  position: relative;
  cursor: pointer;
  animation: bob 3.2s ease-in-out infinite;
}

@keyframes bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

.fb-body {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(160deg, #d9b98c, #c9a66b);
  border: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  box-shadow: var(--shadow);
}

.fb-ear {
  position: absolute;
  top: -10px;
  width: 16px;
  height: 18px;
  border-radius: 50% 50% 0 0;
  background: #c9a66b;
  border: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  border-bottom: none;
}

.fb-ear.left {
  left: 10px;
  transform: rotate(-24deg);
}

.fb-ear.right {
  right: 10px;
  transform: rotate(24deg);
}

.fb-face {
  position: absolute;
  inset: 22px 14px 18px;
}

.eye {
  position: absolute;
  top: 0;
  width: 7px;
  height: 9px;
  border-radius: 50%;
  background: #3b342a;
  transition: height 0.2s ease;
}

.eye.l {
  left: 4px;
}

.eye.r {
  right: 4px;
}

.eye.closed {
  height: 2px;
  top: 4px;
}

.mouth {
  position: absolute;
  top: 13px;
  left: 50%;
  transform: translateX(-50%);
  width: 10px;
  height: 6px;
  border-bottom: 2px solid #3b342a;
  border-radius: 0 0 10px 10px;
  transition: all 0.2s ease;
}

.mouth.closed {
  width: 6px;
  height: 2px;
  border-bottom: none;
  border-radius: 50%;
  background: #3b342a;
}

.fb-feet {
  position: absolute;
  bottom: -7px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
}

.fb-feet span {
  width: 12px;
  height: 8px;
  border-radius: 50%;
  background: #c9a66b;
  border: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
}

.fb.sleeping {
  animation: none;
  opacity: 0.92;
}

.fb-bubble {
  position: absolute;
  left: 74px;
  bottom: 8px;
  width: 220px;
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--paper-fg);
  white-space: normal;
  z-index: 54;
}
</style>
