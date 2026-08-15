<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { request } from '../../api/client';
import FallbackMascot from './FallbackMascot.vue';

interface MascotConfig {
  enabled: boolean;
  dockedPosition: string;
  scale: number;
  stageWidth: number;
  stageHeight: number;
  modelScale: number;
  modelUrl: string;
  localModelPath: string;
  showChatReply: boolean;
  hideBuiltinTips: boolean;
  welcomeText: string;
  nightText: string;
  idleTips: string[];
}

interface Oml2dLike {
  setStageStyle?: (size: { width?: number; height?: number }) => void;
}

/** 基础舞台尺寸（1.0x），缩放按此换算 */
const BASE_W = 360;
const BASE_H = 640;

const VISIBLE_KEY = 'mb-mascot';
const SIZE_KEY = 'mb-mascot-size';
const MIN_SIZE = 0.5;
const MAX_SIZE = 1.8;

const cfg = ref<MascotConfig | null>(null);
const live2dFailed = ref(false);
const visible = ref(readVisible());
const size = ref(readSize());
const sizePanelOpen = ref(false);

// ---------- LLM 回答气泡 ----------
const replyText = ref('');
let replyHideTimer: number | undefined;

// 舞台宿主容器：oml2d 的舞台/画布/气泡全部挂载到我们自己的 div 里，
// 显示/隐藏直接控制容器，绝不会误伤或漏掉模型本体。
const stageHost = ref<HTMLDivElement | null>(null);

let oml2d: Oml2dLike | null = null;
let hostObserver: MutationObserver | null = null;
let bodyObserver: MutationObserver | null = null;

function readVisible(): boolean {
  try {
    return localStorage.getItem(VISIBLE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function readSize(): number {
  try {
    const v = Number(localStorage.getItem(SIZE_KEY));
    return Number.isFinite(v) && v >= MIN_SIZE && v <= MAX_SIZE ? v : cfg.value?.scale ?? 1;
  } catch {
    return cfg.value?.scale ?? 1;
  }
}

function persistVisible(): void {
  try {
    localStorage.setItem(VISIBLE_KEY, visible.value ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

function persistSize(): void {
  try {
    localStorage.setItem(SIZE_KEY, String(size.value));
  } catch {
    /* ignore */
  }
}

function stageW(): number {
  return Math.round(cfg.value?.stageWidth ?? BASE_W);
}

function stageH(): number {
  return Math.round(cfg.value?.stageHeight ?? BASE_H);
}

/**
 * 尺寸缩放：用 CSS transform 对宿主容器整体缩放（画布/模型/气泡同步），
 * 不调用 oml2d.setStageStyle —— 后者改舞台 CSS 尺寸会导致内部画布与模型
 * 相对位移（"调大小变成移动"的问题根源）。
 */
function applySize(): void {
  window.dispatchEvent(new Event('resize'));
}

/**
 * 显示/隐藏：用 visibility 而非 display:none。
 * display:none 会让隐藏期间初始化的 PIXI 画布变成 0×0，恢复显示后模型
 * 无法回来（"召唤小人无效"的问题根源）；visibility 保持布局与画布尺寸。
 */
function applyVisible(): void {
  if (stageHost.value) {
    stageHost.value.style.visibility = visible.value ? 'visible' : 'hidden';
    stageHost.value.style.pointerEvents = visible.value ? 'auto' : 'none';
  }
}

function toggleVisible(): void {
  visible.value = !visible.value;
  persistVisible();
  applyVisible();
  if (visible.value) {
    window.setTimeout(() => applySize(), 300);
  }
}

function setSize(value: number): void {
  size.value = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(value * 10) / 10));
  persistSize();
  applySize();
}

/** 交流功能：点击小人（宿主容器内的点击冒泡）打开知识问答面板 */
function onHostClick(): void {
  window.dispatchEvent(new CustomEvent('mb-chat-open'));
}

/**
 * 隐藏 oml2d 自带蓝色气泡/菜单/状态栏：按元素 id 精确白名单，
 * 舞台/画布/全局容器明确排除，且每次执行都会"自愈"舞台（清除
 * 任何可能被注入的 display:none !important）。
 */
const HIDE_IDS = new Set(['oml2d-tips', 'oml2d-menus', 'oml2d-statusBar', 'oml2d-loading', 'oml2d-status']);
const PROTECT_IDS = new Set(['oml2d-stage', 'oml2d-canvas', 'oml2d-global']);

function hideBuiltinTips(): void {
  if (cfg.value?.hideBuiltinTips === false) {
    healStage();
    return;
  }
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[id^="oml2d-"]'))) {
    if (PROTECT_IDS.has(el.id)) continue; // 舞台/画布永不触碰
    if (HIDE_IDS.has(el.id)) {
      el.style.setProperty('display', 'none', 'important');
    }
  }
  healStage();
}

/** 自愈：清除舞台/画布上可能被注入的 display:none !important（旧代码遗留/误伤） */
function healStage(): void {
  for (const id of PROTECT_IDS) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.style.getPropertyValue('display') === 'none') {
      el.style.removeProperty('display');
    }
  }
}

function watchBuiltinTips(): void {
  hostObserver?.disconnect();
  bodyObserver?.disconnect();
  const cb = () => {
    hideBuiltinTips();
    healStage();
  };
  if (stageHost.value) {
    hostObserver = new MutationObserver(cb);
    hostObserver.observe(stageHost.value, { attributes: true, attributeFilter: ['style'], subtree: true, childList: true });
  }
  bodyObserver = new MutationObserver(cb);
  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['style'], subtree: true, childList: true });
}

function onChatReply(e: Event): void {
  if (!cfg.value?.showChatReply) return;
  const text = String((e as CustomEvent<{ text: string }>).detail?.text ?? '');
  replyText.value = text.slice(-400);
  if (replyHideTimer) window.clearTimeout(replyHideTimer);
  replyHideTimer = window.setTimeout(() => {
    replyText.value = '';
  }, 15000);
}

function onMascotUpdated(): void {
  void loadMascotConfig();
}

async function pickModelUrl(): Promise<string> {
  const local = cfg.value?.localModelPath;
  if (local) {
    try {
      const res = await fetch(local, { method: 'HEAD' });
      if (res.ok) return local;
    } catch {
      /* 忽略，回退 CDN */
    }
  }
  return cfg.value?.modelUrl ?? '';
}

async function loadMascotConfig(): Promise<void> {
  try {
    cfg.value = await request<MascotConfig>('/api/site/mascot');
  } catch {
    cfg.value = null;
    return;
  }
  if (!cfg.value.enabled) {
    applyVisible();
    return;
  }
  size.value = readSize();
  applyVisible();

  if (oml2d) {
    applySize();
    hideBuiltinTips();
    return;
  }

  try {
    const modelUrl = await pickModelUrl();
    console.log('[mascot] 初始化模型:', modelUrl);
    const { loadOml2d } = await import('oh-my-live2d');
    oml2d = loadOml2d({
      parentElement: stageHost.value ?? undefined, // 舞台挂载到我们自己的容器
      dockedPosition: (cfg.value.dockedPosition as 'left' | 'right') || 'left',
      models: [
        {
          path: modelUrl,
          ...(typeof cfg.value.modelScale === 'number' && cfg.value.modelScale > 0
            ? { scale: cfg.value.modelScale }
            : {}),
        },
      ],
      statusBar: { disabled: true },
      stageStyle: { width: stageW(), height: stageH() },
      tips: {
        welcomeTips: {
          message: {
            morning: cfg.value.welcomeText,
            afternoon: cfg.value.welcomeText,
            night: cfg.value.nightText,
          },
        },
        idleTips: {
          wordTheDay: () =>
            cfg.value?.idleTips[Math.floor(Math.random() * (cfg.value?.idleTips.length || 1))] ?? '',
        },
      },
    });
    console.log('[mascot] Live2D 初始化完成', {
      hostMounted: Boolean(stageHost.value),
      childCount: stageHost.value?.childElementCount ?? 0,
      methods: Object.keys(oml2d ?? {}).slice(0, 12),
    });
    applyVisible();
    applySize();
    // 若初始挂载时容器为隐藏（0×0 画布），恢复显示后需要多次重设尺寸
    for (const delay of [300, 1000, 3000]) {
      window.setTimeout(() => applySize(), delay);
    }
    watchBuiltinTips();
    hideBuiltinTips();
    healStage();
    for (const delay of [300, 1000, 3000, 8000, 20000]) {
      window.setTimeout(() => {
        hideBuiltinTips();
        healStage();
      }, delay);
    }
  } catch (err) {
    console.warn('[mascot] Live2D 加载失败，降级为 CSS 小人:', err);
    live2dFailed.value = true;
  }
}

onMounted(() => {
  window.addEventListener('mb-chat-reply', onChatReply);
  window.addEventListener('mb-mascot-updated', onMascotUpdated);
  void loadMascotConfig();
});

onBeforeUnmount(() => {
  window.removeEventListener('mb-chat-reply', onChatReply);
  window.removeEventListener('mb-mascot-updated', onMascotUpdated);
  hostObserver?.disconnect();
  bodyObserver?.disconnect();
  if (replyHideTimer) window.clearTimeout(replyHideTimer);
});
</script>

<template>
  <template v-if="cfg?.enabled">
    <!-- 舞台宿主容器：Live2D 挂载于此；缩放=CSS transform（origin 左下） -->
    <div
      ref="stageHost"
      class="stage-host"
      :style="{
        width: stageW() + 'px',
        height: stageH() + 'px',
        transform: `scale(${size})`,
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
      }"
      @click="onHostClick"
    ></div>

    <!-- LLM 回答气泡：显示在模型上方（按缩放后的视觉高度定位） -->
    <div
      v-if="cfg.showChatReply && replyText"
      class="reply-bubble card"
      :style="{ bottom: (live2dFailed ? 110 : stageH() * size + 26) + 'px' }"
    >
      {{ replyText }}
    </div>

    <!-- 失败降级：CSS 动画小人 -->
    <FallbackMascot v-if="live2dFailed && visible" :scale="size" />

    <div class="mascot-controls">
      <div v-if="sizePanelOpen" class="size-panel card">
        <span class="size-value">{{ size.toFixed(1) }}x</span>
        <input
          type="range"
          :min="MIN_SIZE"
          :max="MAX_SIZE"
          step="0.1"
          :value="size"
          @input="setSize(Number(($event.target as HTMLInputElement).value))"
        />
        <button class="mini" title="重置为默认大小" @click="setSize(cfg?.scale ?? 1)">重置</button>
      </div>
      <button class="mascot-toggle" :title="sizePanelOpen ? '关闭尺寸调节' : '调节大小'" @click="sizePanelOpen = !sizePanelOpen">
        ⚖
      </button>
      <!-- 隐藏状态下显示醒目的召唤按钮 -->
      <button v-if="visible" class="mascot-toggle" title="收起小人" @click="toggleVisible()">🙈</button>
      <button v-else class="summon-btn" title="召唤小人" @click="toggleVisible()">🐣 召唤小人</button>
    </div>
  </template>
</template>

<style scoped>
.stage-host {
  position: fixed;
  left: 0;
  bottom: 0;
  z-index: 90; /* 页面内容之上 */
  overflow: visible;
  transform-origin: left bottom;
  will-change: transform;
}

.reply-bubble {
  position: fixed;
  left: 20px;
  width: 280px;
  max-width: 70vw;
  max-height: 150px;
  overflow-y: auto;
  z-index: 10000;
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--paper-fg);
  white-space: pre-wrap;
  word-break: break-word;
}

.mascot-controls {
  position: fixed;
  left: 18px;
  bottom: 18px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.mascot-toggle {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--paper-border);
  background: var(--card-bg);
  box-shadow: var(--shadow);
  font-size: 15px;
  opacity: 0.75;
  transition: all 0.15s ease;
}

.mascot-toggle:hover {
  opacity: 1;
  border-color: var(--accent);
  transform: scale(1.08);
}

.summon-btn {
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--accent);
  background: var(--card-bg);
  box-shadow: var(--shadow);
  font-size: 13px;
  opacity: 1;
  transition: all 0.15s ease;
}

.summon-btn:hover {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--card-bg));
}

.size-panel {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  margin-bottom: 2px;
}

.size-value {
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--accent);
  min-width: 32px;
}

.size-panel input[type='range'] {
  width: 120px;
  accent-color: var(--accent);
}

.mini {
  border: 1px solid var(--paper-border);
  background: transparent;
  color: var(--paper-fg);
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 12px;
}

.mini:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
