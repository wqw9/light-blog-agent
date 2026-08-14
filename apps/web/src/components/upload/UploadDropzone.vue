<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { UploadResultItem } from '@myblog/shared';
import { uploadFiles } from '../../api/upload';

const emit = defineEmits<{ (e: 'uploaded', results: UploadResultItem[]): void }>();

const dragging = ref(false);
const uploading = ref(false);
const progress = ref(0);
const results = ref<UploadResultItem[]>([]);
const error = ref('');
const fileInput = ref<HTMLInputElement | null>(null);

async function send(files: File[]): Promise<void> {
  if (!files.length || uploading.value) return;
  uploading.value = true;
  error.value = '';
  progress.value = 0;
  results.value = [];
  try {
    const { results: rs } = await uploadFiles(files, (pct) => (progress.value = pct));
    results.value = rs;
    emit('uploaded', rs);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '上传失败';
  } finally {
    uploading.value = false;
  }
}

function onDrop(e: DragEvent): void {
  dragging.value = false;
  void send(Array.from(e.dataTransfer?.files ?? []));
}

function onPick(): void {
  void send(Array.from(fileInput.value?.files ?? []));
  if (fileInput.value) fileInput.value.value = '';
}

/** 剪贴板粘贴：文件直接上传；纯文本包装成 md 上传（设计文档 5.2） */
function onPaste(e: ClipboardEvent): void {
  const files = Array.from(e.clipboardData?.files ?? []);
  if (files.length) {
    e.preventDefault();
    void send(files);
    return;
  }
  const text = e.clipboardData?.getData('text/plain') ?? '';
  if (text.trim().length >= 10) {
    e.preventDefault();
    void send([new File([text], `pasted-${Date.now().toString(36)}.md`, { type: 'text/markdown' })]);
  }
}

onMounted(() => window.addEventListener('paste', onPaste));
onBeforeUnmount(() => window.removeEventListener('paste', onPaste));
</script>

<template>
  <div
    class="dropzone"
    :class="{ dragging }"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
    @click="fileInput?.click()"
  >
    <input
      ref="fileInput"
      type="file"
      multiple
      hidden
      accept=".md,.markdown,.txt,.pdf,.docx,.png,.jpg,.jpeg,.webp,.gif"
      @change="onPick"
    />
    <p class="dz-title">📥 把 Markdown 文件拖到这里 —— 上传即发布</p>
    <p class="dz-hint">支持 .md / .txt / .pdf / .docx / 图片 · 也支持 Ctrl+V 粘贴 · 点击选择文件</p>
    <div v-if="uploading" class="dz-progress">
      <div class="dz-progress-bar" :style="{ width: progress + '%' }"></div>
    </div>
    <ul v-if="results.length" class="dz-results" @click.stop>
      <li v-for="(r, i) in results" :key="i" :class="r.ok ? 'ok' : 'fail'">
        <span class="dz-file">{{ r.filename }}</span>
        <template v-if="r.ok">
          <RouterLink v-if="r.article" :to="`/read/${r.article.slug}`" class="dz-link">
            《{{ r.article.title }}》 {{ r.article.chapterCount }} 章 →
          </RouterLink>
          <a v-else-if="r.url" :href="r.url" target="_blank" rel="noreferrer" class="dz-link">查看图片 →</a>
          <span v-else class="dz-note">{{ r.duplicate ? '重复文件，已跳过' : (r.warning ?? '已入库') }}</span>
        </template>
        <span v-else class="dz-note">{{ r.error }}</span>
      </li>
    </ul>
    <p v-if="error" class="dz-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.dropzone {
  border: 2px dashed var(--paper-border);
  border-radius: var(--radius);
  padding: 26px 20px;
  text-align: center;
  cursor: pointer;
  background: var(--card-bg);
  transition: all 0.15s ease;
}

.dropzone.dragging {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--card-bg));
  transform: scale(1.01);
}

.dz-title {
  margin: 0 0 6px;
  font-family: var(--font-serif);
  font-size: 16px;
}

.dz-hint {
  margin: 0;
  font-size: 12px;
  color: var(--paper-muted);
}

.dz-progress {
  height: 6px;
  border-radius: 3px;
  background: var(--paper-border);
  margin-top: 12px;
  overflow: hidden;
}

.dz-progress-bar {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}

.dz-results {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  text-align: left;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dz-results li {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding: 6px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--paper-border) 35%, transparent);
}

.dz-results li.fail {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
}

.dz-file {
  font-weight: 600;
}

.dz-link {
  color: var(--accent);
}

.dz-note {
  color: var(--paper-muted);
}

.dz-error {
  color: var(--danger);
  font-size: 13px;
}
</style>
