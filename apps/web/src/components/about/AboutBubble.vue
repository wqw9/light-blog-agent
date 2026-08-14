<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { request } from '../../api/client';

interface AboutData {
  name: string;
  signature: string;
  avatar: string;
  skills: string[];
  timeline: { year: string; event: string }[];
  links: { label: string; url: string }[];
}

const open = ref(false);
const loaded = ref(false);
const about = ref<AboutData>({ name: '', signature: '', avatar: '', skills: [], timeline: [], links: [] });

async function load(): Promise<void> {
  if (loaded.value) return;
  try {
    about.value = await request<AboutData>('/api/site/about');
  } catch {
    /* 保持默认 */
  }
  loaded.value = true;
}

function toggle(): void {
  open.value = !open.value;
  if (open.value) void load();
}

/** 全局快捷键 A：呼出自我介绍名片（输入框内不触发） */
function onKeydown(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  if (e.key === 'a' || e.key === 'A') {
    e.preventDefault();
    toggle();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="about-bubble" title="关于我 (A)">
    <button class="bubble-btn" :class="{ active: open }" @click="toggle()">👤</button>

    <Teleport to="body">
      <div v-if="open" class="card-backdrop" @click="open = false"></div>
      <aside v-if="open" class="about-card card">
        <div class="ac-head">
          <div class="avatar" :style="about.avatar ? { backgroundImage: `url(${about.avatar})` } : {}">
            <span v-if="!about.avatar">{{ (about.name || '我').slice(0, 1) }}</span>
          </div>
          <div>
            <h3 class="ac-name">{{ about.name || '你的名字' }}</h3>
            <p class="ac-signature">{{ about.signature }}</p>
          </div>
          <button class="ac-close" @click="open = false">✕</button>
        </div>

        <div v-if="about.skills.length" class="ac-section">
          <h4>技能树</h4>
          <div class="skills">
            <span v-for="s in about.skills" :key="s" class="skill">{{ s }}</span>
          </div>
        </div>

        <div v-if="about.timeline.length" class="ac-section">
          <h4>时间线</h4>
          <ul class="timeline">
            <li v-for="t in about.timeline" :key="t.year">
              <span class="tl-year">{{ t.year }}</span>
              <span class="tl-event">{{ t.event }}</span>
            </li>
          </ul>
        </div>

        <div class="ac-foot">
          <a v-for="l in about.links" :key="l.label" class="btn mini" :href="l.url" target="_blank" rel="noreferrer">
            {{ l.label }}
          </a>
          <RouterLink to="/about" class="btn mini" @click="open = false">完整介绍 →</RouterLink>
        </div>
      </aside>
    </Teleport>
  </div>
</template>

<style scoped>
.about-bubble {
  position: fixed;
  right: 18px;
  bottom: 22px;
  z-index: 55;
}

.bubble-btn {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid var(--paper-border);
  background: var(--card-bg);
  box-shadow: var(--shadow);
  font-size: 20px;
  transition: transform 0.15s ease;
}

.bubble-btn:hover,
.bubble-btn.active {
  transform: scale(1.08);
  border-color: var(--accent);
}

.card-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  z-index: 62;
}

.about-card {
  position: fixed;
  right: 18px;
  bottom: 78px;
  width: 320px;
  max-width: 90vw;
  max-height: 70vh;
  overflow-y: auto;
  z-index: 63;
  padding: 18px 20px;
}

.ac-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--accent) 20%, var(--card-bg));
  color: var(--accent);
  font-family: var(--font-serif);
  font-size: 22px;
  background-size: cover;
  background-position: center;
}

.ac-name {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 17px;
}

.ac-signature {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--paper-muted);
}

.ac-close {
  margin-left: auto;
  border: none;
  background: transparent;
  font-size: 15px;
  color: var(--paper-muted);
  align-self: flex-start;
}

.ac-section {
  margin-top: 14px;
}

.ac-section h4 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--paper-muted);
  font-weight: 600;
}

.skills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.skill {
  font-size: 12.5px;
  padding: 3px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}

.timeline {
  list-style: none;
  margin: 0;
  padding: 0 0 0 14px;
  border-left: 2px solid var(--paper-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.timeline li {
  display: flex;
  gap: 10px;
  align-items: baseline;
  font-size: 13px;
}

.tl-year {
  font-family: var(--font-mono);
  color: var(--accent);
  font-weight: 700;
  flex-shrink: 0;
}

.tl-event {
  color: var(--paper-fg);
}

.ac-foot {
  margin-top: 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn.mini {
  padding: 4px 12px;
  font-size: 12.5px;
}
</style>
