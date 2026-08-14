<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import {
  chatStream,
  llmStatus,
  listSessions,
  getSession,
  deleteSession,
  type ChatMessage,
  type ChatSessionMeta,
  type Citation,
} from '../../api/llm';

const open = ref(false);
const enabled = ref(false);
const messages = ref<{ role: 'user' | 'assistant'; content: string; citations?: Citation[] }[]>([]);
const input = ref('');
const streaming = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

// ---------- 历史记录 ----------
const sessions = ref<ChatSessionMeta[]>([]);
const sessionId = ref<number | null>(null);
const historyOpen = ref(false);
const deletingSessionId = ref<number | null>(null);

let replyTimer: number | undefined;

async function checkStatus(): Promise<void> {
  try {
    const status = await llmStatus();
    enabled.value = status.enabled && status.configured;
  } catch {
    enabled.value = false;
  }
}

async function refreshSessions(): Promise<void> {
  try {
    sessions.value = await listSessions();
  } catch {
    sessions.value = [];
  }
}

async function send(): Promise<void> {
  const text = input.value.trim();
  if (!text || streaming.value) return;
  input.value = '';
  messages.value.push({ role: 'user', content: text });
  messages.value.push({ role: 'assistant', content: '' });
  const reply = messages.value[messages.value.length - 1];
  streaming.value = true;
  try {
    const history: ChatMessage[] = messages.value
      .filter((m) => m.content)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));
    const result = await chatStream(
      history,
      (delta) => {
        reply.content += delta;
        // 小人气泡：回答内容实时显示在模型上方（节流）
        if (replyTimer) window.clearTimeout(replyTimer);
        replyTimer = window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('mb-chat-reply', { detail: { text: reply.content } }));
        }, 300);
      },
      sessionId.value ?? undefined,
    );
    reply.citations = result.citations;
    sessionId.value = result.sessionId || sessionId.value;
    window.dispatchEvent(new CustomEvent('mb-chat-reply', { detail: { text: reply.content } }));
    if (!reply.content) reply.content = '（无回答）';
    void refreshSessions();
  } catch (err) {
    reply.content = err instanceof Error ? `⚠️ ${err.message}` : '⚠️ 请求失败';
    window.dispatchEvent(new CustomEvent('mb-chat-reply', { detail: { text: reply.content } }));
  } finally {
    streaming.value = false;
    if (replyTimer) {
      window.clearTimeout(replyTimer);
      replyTimer = undefined;
    }
  }
}

function newChat(): void {
  messages.value = [];
  sessionId.value = null;
  historyOpen.value = false;
}

async function openSession(id: number): Promise<void> {
  try {
    const detail = await getSession(id);
    sessionId.value = detail.id;
    messages.value = detail.messages.map((m) => ({
      role: m.role === 'ASSISTANT' ? 'assistant' : 'user',
      content: m.content,
      citations: m.citations,
    }));
    historyOpen.value = false;
  } catch {
    /* 会话可能已被删除 */
    void refreshSessions();
  }
}

async function removeSession(id: number): Promise<void> {
  deletingSessionId.value = id;
  try {
    await deleteSession(id);
    if (sessionId.value === id) newChat();
    await refreshSessions();
  } finally {
    deletingSessionId.value = null;
  }
}

function ask(question: string): void {
  open.value = true;
  input.value = question;
  void send();
}

function onAskEvent(e: Event): void {
  const detail = (e as CustomEvent<{ question: string }>).detail;
  if (detail?.question) ask(detail.question);
}

/** 管理页保存 LLM 配置后重新检查状态（按钮显示/隐藏） */
function onLlmUpdated(): void {
  void checkStatus();
}

/** 点击 Live2D 小人 → 打开问答面板并聚焦输入框 */
function onMascotChat(): void {
  open.value = true;
  window.setTimeout(() => inputEl.value?.focus(), 100);
}

onMounted(() => {
  void checkStatus();
  void refreshSessions();
  window.addEventListener('mb-ask', onAskEvent);
  window.addEventListener('mb-llm-updated', onLlmUpdated);
  window.addEventListener('mb-chat-open', onMascotChat);
});

onBeforeUnmount(() => {
  window.removeEventListener('mb-ask', onAskEvent);
  window.removeEventListener('mb-llm-updated', onLlmUpdated);
  window.removeEventListener('mb-chat-open', onMascotChat);
});
</script>

<template>
  <template v-if="enabled">
    <button class="chat-bubble" :class="{ active: open }" title="知识问答" @click="open = !open">💬</button>

    <Teleport to="body">
      <div v-if="open" class="chat-backdrop" @click="open = false"></div>
      <aside v-if="open" class="chat-drawer card">
        <div class="cd-head">
          <button class="cd-history-btn" :class="{ active: historyOpen }" title="历史记录" @click="historyOpen = !historyOpen">📜</button>
          <h3>💬 知识问答</h3>
          <button v-if="messages.length" class="cd-new-btn" title="新对话" @click="newChat">＋</button>
          <button class="cd-close" @click="open = false">✕</button>
        </div>

        <!-- 历史记录 -->
        <div v-if="historyOpen" class="cd-history">
          <div v-if="!sessions.length" class="cd-hint">还没有历史对话。</div>
          <div v-for="s in sessions" :key="s.id" class="history-item">
            <button class="h-title" :title="s.title" @click="openSession(s.id)">
              {{ s.title || '（无标题）' }}
              <span class="h-meta">{{ s.messageCount }} 条</span>
            </button>
            <template v-if="deletingSessionId === s.id">
              <button class="mini danger" @click="removeSession(s.id)">确认</button>
            </template>
            <button v-else class="mini danger" title="删除会话" @click="deletingSessionId = s.id">🗑</button>
          </div>
        </div>

        <div class="cd-messages">
          <p v-if="!messages.length" class="cd-hint">
            问我任何关于书架上文章的问题，回答会附带来源引用。例如："书页主题有哪几种？"
          </p>
          <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
            <div class="bubble">{{ m.content || (streaming && i === messages.length - 1 ? '思考中…' : '') }}</div>
            <div v-if="m.citations?.length" class="citations">
              <span class="c-label">来源：</span>
              <RouterLink v-for="c in m.citations" :key="c.slug + c.id" :to="`/read/${c.slug}`" class="c-link">
                《{{ c.title }}》
              </RouterLink>
            </div>
          </div>
        </div>
        <div class="cd-input-row">
          <input
            ref="inputEl"
            v-model="input"
            class="cd-input"
            placeholder="输入问题，Enter 发送"
            :disabled="streaming"
            @keydown.enter="send"
          />
          <button class="btn btn-primary" :disabled="streaming || !input.trim()" @click="send">发送</button>
        </div>
      </aside>
    </Teleport>
  </template>
</template>

<style scoped>
.chat-bubble {
  position: fixed;
  right: 18px;
  bottom: 78px;
  z-index: 55;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid var(--paper-border);
  background: var(--card-bg);
  box-shadow: var(--shadow);
  font-size: 20px;
  transition: transform 0.15s ease;
}

.chat-bubble:hover,
.chat-bubble.active {
  transform: scale(1.08);
  border-color: var(--accent);
}

.chat-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  z-index: 62;
}

.chat-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 400px;
  max-width: 92vw;
  z-index: 63;
  display: flex;
  flex-direction: column;
  border-radius: 0;
  border-left: 1px solid var(--paper-border);
  padding: 16px 18px;
}

.cd-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.cd-head h3 {
  margin: 0;
  font-family: var(--font-serif);
  flex: 1;
}

.cd-history-btn,
.cd-new-btn,
.cd-close {
  border: none;
  background: transparent;
  font-size: 15px;
  color: var(--paper-muted);
}

.cd-history-btn.active {
  color: var(--accent);
}

.cd-history {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--paper-border);
  border-radius: 10px;
  padding: 6px;
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.h-title {
  flex: 1;
  min-width: 0;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--paper-fg);
  font-size: 13px;
  padding: 6px 8px;
  border-radius: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.h-title:hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.h-meta {
  color: var(--paper-muted);
  font-size: 11px;
  margin-left: 6px;
}

.mini {
  border: 1px solid var(--paper-border);
  background: transparent;
  color: var(--paper-fg);
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 12px;
}

.mini.danger:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.cd-messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 2px;
}

.cd-hint {
  color: var(--paper-muted);
  font-size: 13px;
  line-height: 1.7;
}

.msg {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.msg.user {
  align-items: flex-end;
}

.bubble {
  max-width: 86%;
  padding: 9px 13px;
  border-radius: 12px;
  font-size: 13.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  background: color-mix(in srgb, var(--paper-border) 45%, transparent);
  color: var(--paper-fg);
}

.msg.user .bubble {
  background: color-mix(in srgb, var(--accent) 18%, var(--card-bg));
}

.citations {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  padding: 2px 6px;
}

.c-label {
  font-size: 11.5px;
  color: var(--paper-muted);
}

.c-link {
  font-size: 12px;
}

.cd-input-row {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--paper-border);
}

.cd-input {
  flex: 1;
  padding: 9px 12px;
  border: 1px solid var(--paper-border);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--paper-fg);
  font-size: 13.5px;
}

.cd-input:focus {
  outline: none;
  border-color: var(--accent);
}
</style>
