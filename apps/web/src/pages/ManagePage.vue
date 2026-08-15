<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { ArticleSummary } from '@myblog/shared';
import { ApiError } from '../api/client';
import { deleteArticle, getArticleRaw, listArticles, updateArticle, listTags, createTag, updateTag, deleteTag, type ArticleRaw, type TagInfo } from '../api/articles';
import { deleteUpload, listUploads, reparseUpload, type UploadRecord } from '../api/uploads';
import { getAboutRaw, updateAbout, type AboutData } from '../api/about';
import { llmStatus, organizeArticle, getLlmConfig, saveLlmConfig, imageToMd, docToMd, getPrompts, savePrompts, listSkills, saveSkill, deleteSkill, generateSkill, runSkill, testLlm, getUsage, getMascotConfig, saveMascotConfig, type SkillInfo } from '../api/llm';
import { uploadFiles } from '../api/upload';
import { useAdminStore } from '../stores/admin';
import { useUndoStore } from '../stores/undo';

const route = useRoute();
const admin = useAdminStore();
const undo = useUndoStore();

type Tab = 'articles' | 'uploads' | 'about' | 'llm' | 'skills' | 'tags';
const tab = ref<Tab>('articles');

const articles = ref<ArticleSummary[]>([]);
const uploads = ref<UploadRecord[]>([]);
const loading = ref(false);
const error = ref('');

// ---------- 上传图片选择器（头像 / 封面） ----------
const pickerTarget = ref<'' | 'avatar' | 'cover'>('');
const pickerImages = computed(() => uploads.value.filter((u) => u.kind === 'IMAGE'));
function openPicker(target: 'avatar' | 'cover'): void {
  pickerTarget.value = target;
  if (!uploads.value.length) void loadUploads();
}
function applyPicked(url: string): void {
  if (pickerTarget.value === 'avatar') aboutForm.value.avatar = url;
  else if (pickerTarget.value === 'cover') editForm.value.cover = url;
  pickerTarget.value = '';
}

// ---------- 文章编辑弹窗 ----------
const editing = ref<ArticleRaw | null>(null);
const editForm = ref({
  title: '',
  summary: '',
  category: '',
  cover: '',
  tagsText: '',
  status: 'PUBLISHED',
  private: false,
  contentMarkdown: '',
});
const saving = ref(false);

// ---------- 删除确认（两步） ----------
const deletingId = ref<number | null>(null);
const deletingTitle = ref('');
const deletingUploadId = ref<number | null>(null);

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: '已发布',
  DRAFT: '草稿',
  ARCHIVED: '归档',
};

async function loadArticles(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const res = await listArticles({ status: 'all', pageSize: 50 });
    articles.value = res.items;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '文章列表加载失败';
  } finally {
    loading.value = false;
  }
}

async function loadUploads(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const res = await listUploads({ pageSize: 50 });
    uploads.value = res.items;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '上传记录加载失败';
  } finally {
    loading.value = false;
  }
}

function switchTab(next: Tab): void {
  tab.value = next;
  error.value = '';
  if (next === 'articles') void loadArticles();
  else if (next === 'uploads') void loadUploads();
  else if (next === 'about') void loadAbout();
  else if (next === 'llm') void loadLlmForm();
  else if (next === 'tags') void loadTagsTab();
  else void loadSkillsTab();
}

// ---------- 标签管理（增删改 + 计数） ----------
const tagRows = ref<TagInfo[]>([]);
const newTagForm = ref({ name: '', color: '#8c5a2b' });
const editingTagName = ref('');
const editingTagValue = ref('');
const editingTagColor = ref('#8c5a2b');
const deletingTagName = ref<string | null>(null);

async function loadTagsTab(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    tagRows.value = await listTags();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '标签加载失败';
  } finally {
    loading.value = false;
  }
}

async function addTagNow(): Promise<void> {
  const name = newTagForm.value.name.trim();
  if (!name) return;
  error.value = '';
  try {
    await createTag(name, newTagForm.value.color || undefined);
    newTagForm.value = { name: '', color: '#8c5a2b' };
    await loadTagsTab();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '添加失败';
  }
}

function startEditTag(tag: TagInfo): void {
  editingTagName.value = tag.name;
  editingTagValue.value = tag.name;
  editingTagColor.value = tag.color ?? '#8c5a2b';
}

async function saveTagRow(): Promise<void> {
  const oldName = editingTagName.value;
  const newName = editingTagValue.value.trim();
  if (!oldName || !newName) return;
  error.value = '';
  try {
    await updateTag(oldName, { newName, color: editingTagColor.value });
    editingTagName.value = '';
    await loadTagsTab();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '保存失败';
  }
}

async function removeTagRow(name: string): Promise<void> {
  error.value = '';
  try {
    await deleteTag(name);
    deletingTagName.value = null;
    await loadTagsTab();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '删除失败';
    deletingTagName.value = null;
  }
}

// ---------- Skill 库（自主增删改 + 一键生成 + 运行） ----------
const skills = ref<SkillInfo[]>([]);
const genForm = ref({ name: '', description: '' });
const generating = ref(false);
const editingSkill = ref<SkillInfo | null>(null);
const skillEditForm = ref({ description: '', content: '' });
const skillSaving = ref(false);
const runTarget = ref<SkillInfo | null>(null);
const runArticleId = ref<number | null>(null);
const runningSkill = ref(false);
const deletingSkillName = ref<string | null>(null);

async function loadSkillsTab(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    skills.value = await listSkills();
    await loadArticles(); // 运行 Skill 需要文章列表
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Skill 列表加载失败';
  } finally {
    loading.value = false;
  }
}

async function doGenerateSkill(): Promise<void> {
  if (!genForm.value.name.trim() || !genForm.value.description.trim() || generating.value) return;
  generating.value = true;
  error.value = '';
  try {
    const created = await generateSkill(genForm.value.name.trim(), genForm.value.description.trim());
    genForm.value = { name: '', description: '' };
    skills.value = await listSkills();
    openSkillEditor(created.name);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '生成失败（需启用 LLM）';
  } finally {
    generating.value = false;
  }
}

function openSkillEditor(name: string): void {
  const skill = skills.value.find((s) => s.name === name);
  if (!skill) return;
  editingSkill.value = skill;
  skillEditForm.value = { description: skill.description, content: skill.content };
}

async function doSaveSkill(): Promise<void> {
  if (!editingSkill.value) return;
  skillSaving.value = true;
  error.value = '';
  try {
    const saved = await saveSkill(editingSkill.value.name, skillEditForm.value.content, skillEditForm.value.description);
    editingSkill.value = null;
    skills.value = await listSkills();
    if (saved.builtin) void loadLlmForm(); // 内置核心提示词同步刷新（LLM 标签展示同一文件）
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '保存失败';
  } finally {
    skillSaving.value = false;
  }
}

async function doDeleteSkill(skill: SkillInfo): Promise<void> {
  deletingSkillName.value = skill.name;
  error.value = '';
  try {
    await deleteSkill(skill.name);
    deletingSkillName.value = null;
    skills.value = await listSkills();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '删除失败';
    deletingSkillName.value = null;
  }
}

async function doRunSkill(): Promise<void> {
  if (!runTarget.value || runArticleId.value == null || runningSkill.value) return;
  runningSkill.value = true;
  error.value = '';
  try {
    const result = await runSkill(runTarget.value.name, runArticleId.value);
    undo.pushOp({ articleId: result.article.id, title: result.article.title, action: `Skill 运行`, at: Date.now() });
    runTarget.value = null;
    await loadArticles();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '运行失败（需启用 LLM）';
  } finally {
    runningSkill.value = false;
  }
}

// ---------- LLM 配置（多供应商 / 限额 / 花费，写回 config/llm.json，apiKey 立即加密） ----------
interface ProviderForm {
  name: string;
  baseUrl: string;
  model: string;
  visionModel: string;
  priceInPer1k: number;
  priceOutPer1k: number;
  apiKey: string;
  apiKeyConfigured: boolean;
}

const llmForm = ref({
  enabled: false,
  activeProvider: 'deepseek',
  dailyTokenLimit: 0,
  costLimitUsd: 0,
  providers: [] as ProviderForm[],
});
const llmView = ref<{ providers: ProviderForm[] } | null>(null);
const llmSaving = ref(false);
const llmSaved = ref('');
const usage = ref<{ todayTokens: number; todayCalls: number; todayCostUsd: number; totalCostUsd: number } | null>(null);
const mascotForm = ref({ enabled: true, showChatReply: true, hideBuiltinTips: true });
const mascotSaved = ref('');

async function loadLlmForm(): Promise<void> {
  loading.value = true;
  error.value = '';
  llmSaved.value = '';
  mascotSaved.value = '';
  try {
    const [view, usageData, mascotCfg, skillList] = await Promise.all([
      getLlmConfig(),
      getUsage().catch(() => null),
      getMascotConfig().catch(() => null),
      listSkills(),
    ]);
    llmView.value = view;
    llmForm.value = {
      enabled: view.enabled,
      activeProvider: view.activeProvider,
      dailyTokenLimit: view.dailyTokenLimit,
      costLimitUsd: view.costLimitUsd,
      providers: view.providers.map((p) => ({
        name: p.name,
        baseUrl: p.baseUrl,
        model: p.model,
        visionModel: p.visionModel,
        priceInPer1k: p.priceInPer1k,
        priceOutPer1k: p.priceOutPer1k,
        apiKey: '',
        apiKeyConfigured: p.apiKeyConfigured,
      })),
    };
    usage.value = usageData;
    if (mascotCfg) {
      mascotForm.value = {
        enabled: mascotCfg.enabled,
        showChatReply: mascotCfg.showChatReply !== false,
        hideBuiltinTips: mascotCfg.hideBuiltinTips !== false,
      };
    }
    skills.value = skillList; // Skill 名字列表（编辑入口在 Skill 库）
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'LLM 配置加载失败';
  } finally {
    loading.value = false;
  }
}

function addProvider(): void {
  llmForm.value.providers.push({
    name: `custom-${llmForm.value.providers.length + 1}`,
    baseUrl: '',
    model: '',
    visionModel: '',
    priceInPer1k: 0,
    priceOutPer1k: 0,
    apiKey: '',
    apiKeyConfigured: false,
  });
}

function removeProvider(index: number): void {
  const p = llmForm.value.providers[index];
  if (!p) return;
  if (p.name === llmForm.value.activeProvider) llmForm.value.activeProvider = llmForm.value.providers[0]?.name ?? '';
  llmForm.value.providers.splice(index, 1);
}

async function saveLlmNow(): Promise<void> {
  llmSaving.value = true;
  error.value = '';
  llmSaved.value = '';
  try {
    const view = await saveLlmConfig({
      enabled: llmForm.value.enabled,
      activeProvider: llmForm.value.activeProvider,
      dailyTokenLimit: Number(llmForm.value.dailyTokenLimit) || 0,
      costLimitUsd: Number(llmForm.value.costLimitUsd) || 0,
      providers: llmForm.value.providers.map((p) => ({
        name: p.name.trim(),
        baseUrl: p.baseUrl.trim(),
        model: p.model.trim(),
        visionModel: p.visionModel.trim(),
        priceInPer1k: Number(p.priceInPer1k) || 0,
        priceOutPer1k: Number(p.priceOutPer1k) || 0,
        apiKey: p.apiKey.trim() || undefined,
      })),
    });
    llmView.value = view;
    llmForm.value.providers.forEach((p) => {
      p.apiKey = '';
      p.apiKeyConfigured = view.providers.find((v) => v.name === p.name)?.apiKeyConfigured ?? false;
    });
    usage.value = await getUsage().catch(() => usage.value);
    llmSaved.value = '已保存 —— 配置即时生效（apiKey 已加密存储）';
    window.dispatchEvent(new CustomEvent('mb-llm-updated'));
    void checkLlm();
    window.setTimeout(() => {
      llmSaved.value = '';
    }, 4000);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '保存失败';
  } finally {
    llmSaving.value = false;
  }
}

async function saveMascotNow(): Promise<void> {
  error.value = '';
  mascotSaved.value = '';
  try {
    const saved = await saveMascotConfig({
      enabled: mascotForm.value.enabled,
      showChatReply: mascotForm.value.showChatReply,
      hideBuiltinTips: mascotForm.value.hideBuiltinTips,
    });
    mascotForm.value = {
      enabled: saved.enabled,
      showChatReply: saved.showChatReply !== false,
      hideBuiltinTips: saved.hideBuiltinTips !== false,
    };
    mascotSaved.value = '小人设置已保存 —— 立即生效';
    window.dispatchEvent(new CustomEvent('mb-mascot-updated'));
    window.setTimeout(() => {
      mascotSaved.value = '';
    }, 4000);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '小人设置保存失败';
  }
}

// ---------- LLM 连接测试 ----------
const llmTesting = ref(false);
const llmTestResult = ref('');

async function testLlmNow(): Promise<void> {
  llmTesting.value = true;
  llmTestResult.value = '';
  try {
    const result = await testLlm();
    llmTestResult.value = `✅ 连接成功（${result.provider} · ${result.model}）：${result.reply}`;
  } catch (err) {
    llmTestResult.value = `❌ ${err instanceof Error ? err.message : '测试失败'}`;
  } finally {
    llmTesting.value = false;
  }
}

// ---------- 图片插入（编辑弹窗）与头像上传 ----------
const editorImageInput = ref<HTMLInputElement | null>(null);
const avatarImageInput = ref<HTMLInputElement | null>(null);
const uploadingImage = ref(false);

async function insertImageIntoEditor(): Promise<void> {
  const file = editorImageInput.value?.files?.[0];
  if (!file || uploadingImage.value) return;
  uploadingImage.value = true;
  error.value = '';
  try {
    const { results } = await uploadFiles([file]);
    const url = results[0]?.url;
    if (!url) {
      error.value = results[0]?.error ?? '图片上传失败';
      return;
    }
    const ta = document.querySelector<HTMLTextAreaElement>('.modal textarea.mono');
    if (ta) {
      const start = ta.selectionStart ?? editForm.value.contentMarkdown.length;
      const end = ta.selectionEnd ?? start;
      editForm.value.contentMarkdown =
        editForm.value.contentMarkdown.slice(0, start) + `\n![](${url})\n` + editForm.value.contentMarkdown.slice(end);
    } else {
      editForm.value.contentMarkdown += `\n![](${url})\n`;
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '图片上传失败';
  } finally {
    uploadingImage.value = false;
    if (editorImageInput.value) editorImageInput.value.value = '';
  }
}

async function uploadAvatar(): Promise<void> {
  const file = avatarImageInput.value?.files?.[0];
  if (!file || uploadingImage.value) return;
  uploadingImage.value = true;
  error.value = '';
  try {
    const { results } = await uploadFiles([file]);
    const url = results[0]?.url;
    if (!url) {
      error.value = results[0]?.error ?? '头像上传失败';
      return;
    }
    aboutForm.value.avatar = url;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '头像上传失败';
  } finally {
    uploadingImage.value = false;
    if (avatarImageInput.value) avatarImageInput.value.value = '';
  }
}

// ---------- Skill：图片/文档转文章 ----------
const convertingId = ref<number | null>(null);

async function convertImageToMd(record: UploadRecord): Promise<void> {
  if (convertingId.value != null) return;
  error.value = '';
  convertingId.value = record.id;
  try {
    const result = await imageToMd(record.id);
    undo.pushOp({ articleId: result.article?.id ?? -1, title: result.article?.title ?? record.filename, action: '图片转文章', at: Date.now() });
    await Promise.all([loadUploads(), loadArticles()]);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '转换失败（需启用 LLM 并配置视觉模型）';
  } finally {
    convertingId.value = null;
  }
}

async function convertDocToMd(record: UploadRecord): Promise<void> {
  if (convertingId.value != null) return;
  error.value = '';
  convertingId.value = record.id;
  try {
    const result = await docToMd(record.id);
    undo.pushOp({ articleId: result.article?.id ?? -1, title: result.article?.title ?? record.filename, action: '文档转文章', at: Date.now() });
    await Promise.all([loadUploads(), loadArticles()]);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '转换失败';
  } finally {
    convertingId.value = null;
  }
}

// ---------- 关于我编辑（写回 config/about.json） ----------
const aboutForm = ref({
  name: '',
  signature: '',
  avatar: '',
  skillsText: '',
  timelineText: '',
  linksText: '',
  content: '',
});
const aboutSaving = ref(false);
const aboutSaved = ref('');

async function loadAbout(): Promise<void> {
  loading.value = true;
  error.value = '';
  aboutSaved.value = '';
  try {
    const data: AboutData = await getAboutRaw();
    aboutForm.value = {
      name: data.name ?? '',
      signature: data.signature ?? '',
      avatar: data.avatar ?? '',
      skillsText: (data.skills ?? []).join(', '),
      timelineText: (data.timeline ?? []).map((t) => `${t.year}|${t.event}`).join('\n'),
      linksText: (data.links ?? []).map((l) => `${l.label}|${l.url}`).join('\n'),
      content: data.content ?? '',
    };
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '关于我数据加载失败';
  } finally {
    loading.value = false;
  }
}

async function saveAboutNow(): Promise<void> {
  if (!aboutForm.value.name.trim()) {
    error.value = '名字不能为空';
    return;
  }
  aboutSaving.value = true;
  error.value = '';
  aboutSaved.value = '';
  try {
    await updateAbout({
      name: aboutForm.value.name.trim(),
      signature: aboutForm.value.signature.trim(),
      avatar: aboutForm.value.avatar.trim(),
      skills: aboutForm.value.skillsText
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      timeline: aboutForm.value.timelineText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const idx = line.indexOf('|');
          return idx >= 0 ? { year: line.slice(0, idx).trim(), event: line.slice(idx + 1).trim() } : { year: '', event: line };
        })
        .filter((t) => t.year && t.event),
      links: aboutForm.value.linksText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const idx = line.indexOf('|');
          return idx >= 0 ? { label: line.slice(0, idx).trim(), url: line.slice(idx + 1).trim() } : { label: line, url: '' };
        })
        .filter((l) => l.label && l.url),
      content: aboutForm.value.content,
    });
    aboutSaved.value = '已保存 —— 介绍页即时更新';
    window.setTimeout(() => {
      aboutSaved.value = '';
    }, 4000);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '保存失败';
  } finally {
    aboutSaving.value = false;
  }
}

// ---------- 编辑 ----------
async function openEditor(article: ArticleSummary): Promise<void> {
  error.value = '';
  try {
    const raw = await getArticleRaw(article.id);
    editing.value = raw;
    editForm.value = {
      title: raw.title,
      summary: raw.summary ?? '',
      category: raw.category ?? '',
      cover: raw.cover ?? '',
      tagsText: raw.tags.join(', '),
      status: raw.status,
      private: raw.private,
      contentMarkdown: raw.contentMarkdown,
    };
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载原文失败';
  }
}

function closeEditor(): void {
  editing.value = null;
}

async function saveEditor(): Promise<void> {
  if (!editing.value) return;
  const title = editForm.value.title.trim();
  if (!title) {
    error.value = '标题不能为空';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await updateArticle(editing.value.id, {
      title,
      summary: editForm.value.summary.trim(),
      category: editForm.value.category.trim(),
      cover: editForm.value.cover.trim(),
      tags: editForm.value.tagsText
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean),
      status: editForm.value.status,
      private: editForm.value.private,
      contentMarkdown: editForm.value.contentMarkdown,
    });
    undo.pushOp({ articleId: editing.value.id, title, action: '编辑', at: Date.now() });
    editing.value = null;
    await loadArticles();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '保存失败';
  } finally {
    saving.value = false;
  }
}

// ---------- 状态切换 ----------
async function toggleStatus(article: ArticleSummary): Promise<void> {
  error.value = '';
  try {
    await updateArticle(article.id, { status: article.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' });
    undo.pushOp({ articleId: article.id, title: article.title, action: '状态切换', at: Date.now() });
    await loadArticles();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '状态切换失败';
  }
}

// ---------- 删除 ----------
async function doDeleteArticle(): Promise<void> {
  if (deletingId.value == null) return;
  error.value = '';
  try {
    await deleteArticle(deletingId.value);
    undo.pushOp({ articleId: deletingId.value, title: deletingTitle.value || '文章', action: '删除', at: Date.now() });
    deletingId.value = null;
    deletingTitle.value = '';
    await loadArticles();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '删除失败';
  }
}

async function doDeleteUpload(): Promise<void> {
  if (deletingUploadId.value == null) return;
  error.value = '';
  try {
    await deleteUpload(deletingUploadId.value);
    deletingUploadId.value = null;
    await loadUploads();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '删除失败';
  }
}

async function doReparse(record: UploadRecord): Promise<void> {
  error.value = '';
  try {
    await reparseUpload(record.id);
    await Promise.all([loadUploads(), loadArticles()]);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '重新解析失败';
  }
}

// ---------- AI 书籍整理 ----------
const organizingId = ref<number | null>(null);
const llmAvailable = ref(false);

async function checkLlm(): Promise<void> {
  try {
    const status = await llmStatus();
    llmAvailable.value = status.enabled && status.configured;
  } catch {
    llmAvailable.value = false;
  }
}

async function doOrganize(article: ArticleSummary): Promise<void> {
  if (organizingId.value != null) return;
  error.value = '';
  organizingId.value = article.id;
  try {
    const result = await organizeArticle(article.id);
    undo.pushOp({ articleId: article.id, title: result.summary || article.title, action: 'AI 整理', at: Date.now() });
    await loadArticles();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'AI 整理失败（请检查 config/llm.json 是否启用并配置 apiKey）';
  } finally {
    organizingId.value = null;
  }
}

// ---------- 工具 ----------
function fmtDate(value: string): string {
  return value.slice(0, 10);
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** 撤销完成 → 刷新列表 */
function onUndoDone(): void {
  void loadArticles();
  void loadUploads();
}

onMounted(async () => {
  window.addEventListener('mb-undo-done', onUndoDone);
  await loadArticles();
  void loadUploads(); // 修复：刷新时上传记录计数为 0
  void loadTagsTab(); // 修复：刷新时标签计数为 0
  void checkLlm();
  const editSlug = typeof route.query.edit === 'string' ? route.query.edit : '';
  if (editSlug) {
    const target = articles.value.find((a) => a.slug === editSlug);
    if (target) void openEditor(target);
  }
});

onBeforeUnmount(() => window.removeEventListener('mb-undo-done', onUndoDone));
</script>

<template>
  <div class="container manage">
    <div class="head card">
      <h2 class="title">管理</h2>
      <div class="tabs">
        <button class="tab" :class="{ active: tab === 'articles' }" @click="switchTab('articles')">
          文章管理 ({{ articles.length }})
        </button>
        <button class="tab" :class="{ active: tab === 'uploads' }" @click="switchTab('uploads')">
          上传记录 ({{ uploads.length }})
        </button>
        <button class="tab" :class="{ active: tab === 'about' }" @click="switchTab('about')">关于我</button>
        <button class="tab" :class="{ active: tab === 'llm' }" @click="switchTab('llm')">LLM 设置</button>
        <button class="tab" :class="{ active: tab === 'skills' }" @click="switchTab('skills')">Skill 库</button>
        <button class="tab" :class="{ active: tab === 'tags' }" @click="switchTab('tags')">标签 ({{ tagRows.length }})</button>
      </div>
      <div class="auth-state">
        <span v-if="admin.hasToken" class="auth-ok">✓ 管理口令已保存</span>
        <span v-else class="auth-warn">未输入管理口令 · 未设置口令时为开放模式</span>
        <button v-if="admin.hasToken" class="mini" @click="admin.logout()">清除口令</button>
      </div>
    </div>

    <p v-if="error" class="error-banner">{{ error }}</p>
    <p v-if="loading" class="empty">加载中…</p>

    <!-- ============ 文章管理 ============ -->
    <div v-else-if="tab === 'articles'" class="panel card">
      <table v-if="articles.length" class="table">
        <thead>
          <tr>
            <th>标题</th>
            <th>状态</th>
            <th>标签</th>
            <th>字数</th>
            <th>章节</th>
            <th>阅读</th>
            <th>更新时间</th>
            <th class="ops">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in articles" :key="a.id">
            <td class="cell-title">
              <RouterLink :to="`/read/${a.slug}`">{{ a.title }}</RouterLink>
              <span v-if="a.private" class="lock-badge" title="私密：AI 不可读">🔒</span>
            </td>
            <td>
              <span class="badge" :class="a.status.toLowerCase()">{{ STATUS_LABEL[a.status] ?? a.status }}</span>
            </td>
            <td class="cell-tags">{{ a.tags.slice(0, 3).join(' · ') || '—' }}</td>
            <td>{{ a.wordCount }}</td>
            <td>{{ a.chapterCount }}</td>
            <td>{{ a.viewCount }}</td>
            <td>{{ fmtDate(a.updatedAt) }}</td>
            <td class="ops">
              <button v-if="llmAvailable" class="mini" :disabled="organizingId === a.id" title="AI 生成摘要/标签/分类/建议问题" @click="doOrganize(a)">
                {{ organizingId === a.id ? '整理中…' : '🤖 整理' }}
              </button>
              <button class="mini" @click="openEditor(a)">编辑</button>
              <button class="mini" @click="toggleStatus(a)">
                {{ a.status === 'PUBLISHED' ? '下架' : '发布' }}
              </button>
              <template v-if="deletingId === a.id">
                <button class="mini danger" @click="doDeleteArticle">确认删除</button>
                <button class="mini" @click="deletingId = null">取消</button>
              </template>
              <button v-else class="mini danger" @click="deletingId = a.id; deletingTitle = a.title">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">还没有文章 —— 去书架拖一篇 Markdown 进来。</p>
    </div>

    <!-- ============ 上传记录 ============ -->
    <div v-else-if="tab === 'uploads'" class="panel card">
      <table v-if="uploads.length" class="table">
        <thead>
          <tr>
            <th>文件名</th>
            <th>类型</th>
            <th>大小</th>
            <th>状态</th>
            <th>关联文章</th>
            <th>上传时间</th>
            <th class="ops">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in uploads" :key="u.id">
            <td class="cell-title" :title="u.storedPath">
              <span class="cell-file">
                <img v-if="u.kind === 'IMAGE'" class="thumb" :src="`/uploads/${u.storedPath}`" alt="" />
                {{ u.filename }}
              </span>
            </td>
            <td>{{ u.kind }}</td>
            <td>{{ fmtSize(u.size) }}</td>
            <td>
              <span class="badge" :class="u.status.toLowerCase()">{{ u.status }}</span>
            </td>
            <td>
              <RouterLink v-if="u.article" :to="`/read/${u.article.slug}`">{{ u.article.title }}</RouterLink>
              <span v-else>—</span>
            </td>
            <td>{{ fmtDate(u.createdAt) }}</td>
            <td class="ops">
              <button v-if="u.kind === 'IMAGE'" class="mini" :disabled="convertingId === u.id" title="视觉模型读图生成 Markdown 文章" @click="convertImageToMd(u)">
                {{ convertingId === u.id ? '转换中…' : '🖼 转文章' }}
              </button>
              <button v-if="u.kind === 'PDF' || u.kind === 'DOCX'" class="mini" :disabled="convertingId === u.id" title="提取文本生成 Markdown 文章" @click="convertDocToMd(u)">
                {{ convertingId === u.id ? '转换中…' : '📄 转文章' }}
              </button>
              <button v-if="u.kind === 'MD' || u.kind === 'TXT'" class="mini" title="以正确编码重建文章（修复乱码）" @click="doReparse(u)">
                重新解析
              </button>
              <template v-if="deletingUploadId === u.id">
                <button class="mini danger" @click="doDeleteUpload">确认删除</button>
                <button class="mini" @click="deletingUploadId = null">取消</button>
              </template>
              <button v-else class="mini danger" @click="deletingUploadId = u.id">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">还没有上传记录。</p>
    </div>

    <!-- ============ 关于我编辑 ============ -->
    <div v-else-if="tab === 'about'" class="panel card about-panel">
      <div class="form">
        <div class="row">
          <label class="field">
            <span>名字</span>
            <input v-model="aboutForm.name" class="input" maxlength="60" />
          </label>
          <label class="field">
            <span>头像 URL（可留空）</span>
            <div class="input-row">
              <input v-model="aboutForm.avatar" class="input" placeholder="/uploads/img/avatar.png" />
              <button class="btn" :disabled="uploadingImage" @click="avatarImageInput?.click()">
                {{ uploadingImage ? '上传中…' : '上传头像' }}
              </button>
              <button class="btn" @click="openPicker('avatar')">🖼 从图库选</button>
              <input ref="avatarImageInput" type="file" accept=".png,.jpg,.jpeg,.webp,.gif" hidden @change="uploadAvatar" />
            </div>
            <img v-if="aboutForm.avatar" class="avatar-preview" :src="aboutForm.avatar" alt="" />
          </label>
        </div>
        <label class="field">
          <span>一句话签名</span>
          <input v-model="aboutForm.signature" class="input" maxlength="120" />
        </label>
        <label class="field">
          <span>技能树（逗号分隔）</span>
          <input v-model="aboutForm.skillsText" class="input" placeholder="写作, 前端, 阅读" />
        </label>
        <div class="row">
          <label class="field">
            <span>时间线（每行：年份|事件）</span>
            <textarea v-model="aboutForm.timelineText" class="input mono" rows="4" placeholder="2025|创建拾页书阁"></textarea>
          </label>
          <label class="field">
            <span>链接（每行：名称|URL）</span>
            <textarea v-model="aboutForm.linksText" class="input mono" rows="4" placeholder="GitHub|https://github.com/you"></textarea>
          </label>
        </div>
        <label class="field">
          <span>扩展内容（Markdown：可加介绍、经历、代码块、图片、表格等任何内容）</span>
          <textarea v-model="aboutForm.content" class="input mono" rows="12" placeholder="## 关于我&#10;&#10;在这里写想补充的内容……"></textarea>
        </label>
        <div class="about-actions">
          <p v-if="aboutSaved" class="about-saved">{{ aboutSaved }}</p>
          <div class="spacer"></div>
          <RouterLink to="/about" class="btn">预览介绍页</RouterLink>
          <button class="btn btn-primary" :disabled="aboutSaving" @click="saveAboutNow">
            {{ aboutSaving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ============ LLM 设置 ============ -->
    <div v-else-if="tab === 'llm'" class="panel card llm-panel">
      <div class="form">
        <label class="field">
          <span>启用 LLM（知识问答 / AI 整理 / Skill）</span>
          <label class="check-line">
            <input v-model="llmForm.enabled" type="checkbox" />
            <span>{{ llmForm.enabled ? '已启用' : '未启用' }}</span>
          </label>
        </label>

        <h4 class="providers-title">LLM 接口（多供应商，○ 为当前使用）</h4>
        <div v-for="(p, i) in llmForm.providers" :key="p.name + i" class="provider-row">
          <label class="radio" title="设为当前接口">
            <input v-model="llmForm.activeProvider" type="radio" :value="p.name" />
          </label>
          <input v-model="p.name" class="input p-name" title="接口名称" />
          <input v-model="p.baseUrl" class="input" placeholder="Base URL" title="接口地址" />
          <input v-model="p.model" class="input p-model" placeholder="模型" title="对话模型" />
          <input v-model="p.visionModel" class="input p-model" placeholder="视觉模型" title="视觉模型（可留空）" />
          <input v-model="p.priceInPer1k" class="input p-price" type="number" step="0.000001" title="输入价格 $/1K" />
          <input v-model="p.priceOutPer1k" class="input p-price" type="number" step="0.000001" title="输出价格 $/1K" />
          <input
            v-model="p.apiKey"
            class="input p-key"
            type="password"
            :placeholder="p.apiKeyConfigured ? '已加密·留空不改' : 'API Key'"
            title="API Key（保存后自动加密）"
          />
          <button class="mini danger" :disabled="llmForm.providers.length <= 1" title="删除该接口" @click="removeProvider(i)">✕</button>
        </div>
        <div class="provider-head-hint">
          <span>名称</span><span>Base URL</span><span>模型</span><span>视觉模型</span><span>入 $/1K</span><span>出 $/1K</span><span>API Key</span>
        </div>
        <button class="btn" @click="addProvider">＋ 添加接口</button>

        <div class="row limits-row">
          <label class="field">
            <span>每日 Token 限额（0 = 不限）</span>
            <input v-model.number="llmForm.dailyTokenLimit" class="input" type="number" min="0" step="1000" />
          </label>
          <label class="field">
            <span>花费上限 USD（0 = 不限）</span>
            <input v-model.number="llmForm.costLimitUsd" class="input" type="number" min="0" step="0.1" />
          </label>
        </div>

        <p v-if="usage" class="usage-line">
          📊 今日：{{ usage.todayCalls }} 次调用 · {{ usage.todayTokens }} tokens · 花费 ${{ usage.todayCostUsd.toFixed(4) }}
          · 累计花费 <b>${{ usage.totalCostUsd.toFixed(4) }}</b>
        </p>

        <div class="about-actions">
          <p v-if="llmSaved" class="about-saved">{{ llmSaved }}</p>
          <div class="spacer"></div>
          <button class="btn" :disabled="llmTesting" @click="testLlmNow">
            {{ llmTesting ? '测试中…' : '🔌 测试连接' }}
          </button>
          <button class="btn btn-primary" :disabled="llmSaving" @click="saveLlmNow">
            {{ llmSaving ? '保存中…' : '保存' }}
          </button>
        </div>
        <p v-if="llmTestResult" class="llm-test-result">{{ llmTestResult }}</p>

        <h4 class="prompts-title">小人设置</h4>
        <div class="row">
          <label class="field">
            <span>启用小人</span>
            <label class="check-line">
              <input v-model="mascotForm.enabled" type="checkbox" />
              <span>{{ mascotForm.enabled ? '显示' : '隐藏' }}</span>
            </label>
          </label>
          <label class="field">
            <span>LLM 回答气泡（显示在模型上方）</span>
            <label class="check-line">
              <input v-model="mascotForm.showChatReply" type="checkbox" />
              <span>{{ mascotForm.showChatReply ? '显示' : '隐藏' }}</span>
            </label>
          </label>
          <label class="field">
            <span>自带蓝色气泡/菜单（oml2d 默认样式）</span>
            <label class="check-line">
              <input v-model="mascotForm.hideBuiltinTips" type="checkbox" />
              <span>{{ mascotForm.hideBuiltinTips ? '隐藏' : '显示' }}</span>
            </label>
          </label>
        </div>
        <div class="about-actions">
          <p v-if="mascotSaved" class="about-saved">{{ mascotSaved }}</p>
          <div class="spacer"></div>
          <button class="btn btn-primary" @click="saveMascotNow">保存小人设置</button>
        </div>

        <h4 class="prompts-title">Skill 提示词（编辑请到 Skill 库）</h4>
        <div v-if="skills.length" class="prompt-names">
          <div v-for="s in skills" :key="s.name" class="prompt-name-row">
            <span class="skill-name">{{ s.name }}</span>
            <span v-if="s.builtin" class="badge parsed">内置核心</span>
            <span class="prompt-desc">{{ s.description || '（无描述）' }}</span>
            <button class="mini" @click="switchTab('skills'); openSkillEditor(s.name)">编辑 →</button>
          </div>
        </div>
        <p v-else class="llm-note">还没有 Skill —— 到 Skill 库用 ✨ 一键生成。</p>
      </div>
    </div>

    <!-- ============ Skill 库 ============ -->
    <div v-else-if="tab === 'skills'" class="panel card skills-panel">
      <div class="gen-card">
        <h4>✨ 一键生成 Skill（用 AI 写出新 Skill）</h4>
        <div class="form">
          <div class="row">
            <label class="field">
              <span>Skill 名称</span>
              <input v-model="genForm.name" class="input" placeholder="例如：读书笔记" maxlength="60" />
            </label>
            <label class="field">
              <span>用途描述（越具体越好）</span>
              <input v-model="genForm.description" class="input" placeholder="例如：把文章改写成读书笔记，含金句摘录与个人感悟" />
            </label>
          </div>
          <div class="about-actions">
            <div class="spacer"></div>
            <button class="btn btn-primary" :disabled="generating || !genForm.name.trim() || !genForm.description.trim()" @click="doGenerateSkill">
              {{ generating ? '生成中…' : '✨ 生成 Skill' }}
            </button>
          </div>
        </div>
      </div>

      <h4 class="skills-title">Skill 列表（{{ skills.length }}）</h4>
      <div v-if="skills.length" class="skill-list">
        <div v-for="s in skills" :key="s.name" class="skill-item">
          <div class="skill-info">
            <div class="skill-name-row">
              <span class="skill-name">{{ s.name }}</span>
              <span v-if="s.builtin" class="badge parsed">内置核心</span>
            </div>
            <p class="skill-desc">{{ s.description || '（无描述）' }}</p>
          </div>
          <div class="skill-ops">
            <button class="mini" title="对一篇文章运行此 Skill，生成处理后的新文章" @click="runTarget = s; runArticleId = articles[0]?.id ?? null">▶ 运行</button>
            <button class="mini" @click="openSkillEditor(s.name)">编辑</button>
            <template v-if="deletingSkillName === s.name">
              <button class="mini danger" @click="doDeleteSkill(s)">确认删除</button>
              <button class="mini" @click="deletingSkillName = null">取消</button>
            </template>
            <button v-else-if="!s.builtin" class="mini danger" @click="deletingSkillName = s.name">删除</button>
          </div>
        </div>
      </div>
      <p v-else class="empty">还没有 Skill —— 用上面的生成器创建一个。</p>
    </div>

    <!-- ============ 标签管理 ============ -->
    <div v-else-if="tab === 'tags'" class="panel card tags-panel">
      <div class="gen-card">
        <h4>＋ 添加标签</h4>
        <div class="input-row">
          <input v-model="newTagForm.name" class="input" placeholder="标签名" maxlength="30" />
          <input v-model="newTagForm.color" class="input p-color" type="color" title="标签颜色" />
          <button class="btn btn-primary" :disabled="!newTagForm.name.trim()" @click="addTagNow">添加</button>
        </div>
      </div>

      <h4 class="skills-title">标签列表（{{ tagRows.length }}）</h4>
      <div v-if="tagRows.length" class="skill-list">
        <div v-for="t in tagRows" :key="t.name" class="skill-item">
          <template v-if="editingTagName === t.name">
            <input v-model="editingTagValue" class="input tag-edit-name" maxlength="30" />
            <input v-model="editingTagColor" class="input p-color" type="color" />
            <div class="skill-ops">
              <button class="mini" @click="saveTagRow">保存</button>
              <button class="mini" @click="editingTagName = ''">取消</button>
            </div>
          </template>
          <template v-else>
            <span class="tag-dot" :style="{ background: t.color ?? 'var(--accent)' }"></span>
            <span class="skill-name">{{ t.name }}</span>
            <span class="badge draft">{{ t.count }} 篇</span>
            <div class="skill-ops" style="margin-left: auto">
              <button class="mini" @click="startEditTag(t)">编辑</button>
              <template v-if="deletingTagName === t.name">
                <button class="mini danger" @click="removeTagRow(t.name)">确认删除</button>
                <button class="mini" @click="deletingTagName = null">取消</button>
              </template>
              <button v-else class="mini danger" @click="deletingTagName = t.name">删除</button>
            </div>
          </template>
        </div>
      </div>
      <p v-else class="empty">还没有标签 —— 用上方输入框添加，或给文章打标签后自动出现。</p>
    </div>

    <!-- ============ Skill 运行弹窗 ============ -->
    <Teleport to="body">
      <div v-if="runTarget" class="modal-backdrop" @click.self="runTarget = null">
        <div class="modal card small">
          <div class="modal-head">
            <h3>运行 Skill：{{ runTarget.name }}</h3>
            <button class="close" @click="runTarget = null">✕</button>
          </div>
          <p class="llm-note">{{ runTarget.description || '对文章执行此 Skill，生成一篇处理后的新文章（原文章不变）。' }}</p>
          <label class="field">
            <span>选择文章</span>
            <select v-model="runArticleId" class="input">
              <option v-for="a in articles" :key="a.id" :value="a.id">{{ a.title }}</option>
            </select>
          </label>
          <div class="modal-actions">
            <button class="btn" @click="runTarget = null">取消</button>
            <button class="btn btn-primary" :disabled="runningSkill || runArticleId == null" @click="doRunSkill">
              {{ runningSkill ? '运行中…' : '▶ 运行' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ============ Skill 编辑弹窗 ============ -->
    <Teleport to="body">
      <div v-if="editingSkill" class="modal-backdrop" @click.self="editingSkill = null">
        <div class="modal card">
          <div class="modal-head">
            <h3>编辑 Skill：{{ editingSkill.name }}</h3>
            <button class="close" @click="editingSkill = null">✕</button>
          </div>
          <div class="form">
            <label class="field">
              <span>描述</span>
              <input v-model="skillEditForm.description" class="input" maxlength="200" />
            </label>
            <label class="field">
              <span>提示词内容（config/prompts/{{ editingSkill.name }}.md）</span>
              <textarea v-model="skillEditForm.content" class="input mono" rows="12"></textarea>
            </label>
          </div>
          <div class="modal-actions">
            <button class="btn" @click="editingSkill = null">取消</button>
            <button class="btn btn-primary" :disabled="skillSaving" @click="doSaveSkill">
              {{ skillSaving ? '保存中…' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ============ 编辑弹窗 ============ -->
    <Teleport to="body">
      <div v-if="editing" class="modal-backdrop" @click.self="closeEditor()">
        <div class="modal card">
          <div class="modal-head">
            <h3>编辑文章</h3>
            <button class="close" @click="closeEditor()">✕</button>
          </div>
          <div class="form">
            <label class="field">
              <span>标题</span>
              <input v-model="editForm.title" class="input" maxlength="200" />
            </label>
            <div class="row">
              <label class="field">
                <span>状态</span>
                <select v-model="editForm.status" class="input">
                  <option value="PUBLISHED">已发布</option>
                  <option value="DRAFT">草稿</option>
                  <option value="ARCHIVED">归档</option>
                </select>
              </label>
              <label class="field">
                <span>AI 权限</span>
                <label class="check-line">
                  <input v-model="editForm.private" type="checkbox" />
                  <span>{{ editForm.private ? '🔒 私密（AI 不可读）' : 'AI 可读（进入知识库）' }}</span>
                </label>
              </label>
              <label class="field">
                <span>分类（留空清除）</span>
                <input v-model="editForm.category" class="input" />
              </label>
            </div>
            <label class="field">
              <span>标签（逗号分隔）</span>
              <input v-model="editForm.tagsText" class="input" placeholder="随笔, 技术" />
            </label>
            <label class="field">
              <span>封面图 URL</span>
              <div class="input-row">
                <input v-model="editForm.cover" class="input" placeholder="/uploads/img/xxx.png" />
                <button class="btn" @click="openPicker('cover')">🖼 从图库选</button>
              </div>
            </label>
            <label class="field">
              <span>摘要</span>
              <textarea v-model="editForm.summary" class="input" rows="2"></textarea>
            </label>
            <label class="field">
              <span>正文（Markdown，保存后自动重新分章）</span>
              <textarea v-model="editForm.contentMarkdown" class="input mono" rows="14"></textarea>
              <div class="editor-tools">
                <button class="mini" :disabled="uploadingImage" @click="editorImageInput?.click()">
                  {{ uploadingImage ? '上传中…' : '🖼 插入图片' }}
                </button>
                <input ref="editorImageInput" type="file" accept=".png,.jpg,.jpeg,.webp,.gif" hidden @change="insertImageIntoEditor" />
                <span class="hint-text">上传后自动以 ![](url) 插入光标处</span>
              </div>
            </label>
          </div>
          <div class="modal-actions">
            <button class="btn" @click="closeEditor()">取消</button>
            <button class="btn btn-primary" :disabled="saving" @click="saveEditor">{{ saving ? '保存中…' : '保存' }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 上传图片选择器（头像 / 封面） -->
    <Teleport to="body">
      <div v-if="pickerTarget" class="modal-backdrop" @click="pickerTarget = ''"></div>
      <div v-if="pickerTarget" class="modal picker-modal card">
        <div class="modal-head">
          <h3>🖼 选择{{ pickerTarget === 'avatar' ? '头像' : '封面' }}图片</h3>
          <button class="modal-close" @click="pickerTarget = ''">✕</button>
        </div>
        <p v-if="!pickerImages.length" class="empty" style="padding: 20px 0">
          图库还没有图片，先在上传记录页面上传图片吧。
        </p>
        <div v-else class="picker-grid">
          <button
            v-for="u in pickerImages"
            :key="u.id"
            class="picker-item"
            :title="u.filename"
            @click="applyPicked(`/uploads/${u.storedPath}`)"
          >
            <img :src="`/uploads/${u.storedPath}`" :alt="u.filename" />
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.manage {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.head {
  padding: 18px 22px;
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.title {
  margin: 0;
  font-family: var(--font-serif);
}

.tabs {
  display: flex;
  gap: 6px;
}

.tab {
  border: 1px solid var(--paper-border);
  background: transparent;
  color: var(--paper-fg);
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13.5px;
}

.tab.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fdf8ee;
}

.auth-state {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
}

.auth-ok {
  color: var(--success);
}

.auth-warn {
  color: var(--paper-muted);
}

.error-banner {
  margin: 0;
  padding: 10px 14px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
  font-size: 13px;
}

.panel {
  padding: 8px 18px 18px;
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}

.table th {
  text-align: left;
  padding: 12px 10px;
  color: var(--paper-muted);
  font-weight: 600;
  border-bottom: 1px solid var(--paper-border);
  white-space: nowrap;
}

.table td {
  padding: 10px;
  border-bottom: 1px dashed var(--paper-border);
  vertical-align: middle;
}

.cell-title {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-tags {
  color: var(--paper-muted);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  white-space: nowrap;
}

.badge.draft {
  background: color-mix(in srgb, var(--paper-muted) 18%, transparent);
  color: var(--paper-muted);
}

.badge.archived {
  background: color-mix(in srgb, var(--paper-muted) 18%, transparent);
  color: var(--paper-muted);
}

.badge.parsed {
  background: color-mix(in srgb, var(--success) 14%, transparent);
  color: var(--success);
}

.badge.pending {
  background: color-mix(in srgb, var(--paper-muted) 18%, transparent);
  color: var(--paper-muted);
}

.ops {
  white-space: nowrap;
}

.mini {
  border: 1px solid var(--paper-border);
  background: transparent;
  color: var(--paper-fg);
  border-radius: 6px;
  padding: 3px 9px;
  font-size: 12.5px;
  margin-right: 4px;
}

.mini:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.mini.danger:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.empty {
  color: var(--paper-muted);
  text-align: center;
  padding: 40px 0;
}

/* ---------- 编辑弹窗 ---------- */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal {
  width: 720px;
  max-width: 94vw;
  max-height: 90vh;
  overflow-y: auto;
  padding: 22px 26px;
}

.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.modal-head h3 {
  margin: 0;
  font-family: var(--font-serif);
}

.close {
  border: none;
  background: transparent;
  font-size: 16px;
  color: var(--paper-muted);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.row {
  display: flex;
  gap: 12px;
}

.row .field {
  flex: 1;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
  color: var(--paper-muted);
}

.input {
  padding: 8px 12px;
  border: 1px solid var(--paper-border);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--paper-fg);
  font-size: 14px;
  font-family: inherit;
}

.input:focus {
  outline: none;
  border-color: var(--accent);
}

.mono {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.about-panel {
  padding: 20px 22px;
}

.llm-panel {
  padding: 20px 22px;
}

.providers-title {
  margin: 18px 0 6px;
  font-family: var(--font-serif);
  font-size: 15px;
  border-top: 1px dashed var(--paper-border);
  padding-top: 16px;
}

.provider-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 8px;
}

.provider-row .radio {
  flex-shrink: 0;
}

.provider-row .radio input {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
}

.provider-row .p-name {
  width: 90px;
  flex-shrink: 0;
}

.provider-row .p-model {
  width: 130px;
}

.provider-row .p-price {
  width: 86px;
}

.provider-row .p-key {
  flex: 1;
  min-width: 110px;
}

.provider-head-hint {
  display: flex;
  gap: 6px;
  font-size: 11px;
  color: var(--paper-muted);
  padding-left: 24px;
  margin: -2px 0 10px;
}

.provider-head-hint span:nth-child(1) { width: 90px; }
.provider-head-hint span:nth-child(2) { flex: 1; min-width: 0; }
.provider-head-hint span:nth-child(3),
.provider-head-hint span:nth-child(4) { width: 130px; }
.provider-head-hint span:nth-child(5),
.provider-head-hint span:nth-child(6) { width: 86px; }
.provider-head-hint span:nth-child(7) { flex: 1; min-width: 110px; }

.limits-row {
  margin-top: 12px;
}

.usage-line {
  margin: 10px 0 0;
  font-size: 12.5px;
  color: var(--paper-fg);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  border-radius: 8px;
  padding: 8px 12px;
}

.check-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: var(--paper-fg);
}

.check-line input {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
}

.llm-note {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--paper-muted);
  line-height: 1.7;
}

.prompts-title {
  margin: 22px 0 6px;
  font-family: var(--font-serif);
  font-size: 15px;
  border-top: 1px dashed var(--paper-border);
  padding-top: 18px;
}

.prompt-names {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prompt-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--paper-border);
  border-radius: 8px;
}

.prompt-desc {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--paper-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.input-row .input {
  flex: 1;
}

.avatar-preview {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--paper-border);
  margin-top: 4px;
}

.cell-file {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lock-badge {
  margin-left: 6px;
  font-size: 12px;
}

.thumb {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--paper-border);
  flex-shrink: 0;
}

.editor-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.hint-text {
  font-size: 12px;
  color: var(--paper-muted);
}

.llm-test-result {
  margin: 10px 0 0;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  line-height: 1.6;
  background: color-mix(in srgb, var(--paper-border) 40%, transparent);
  white-space: pre-wrap;
  word-break: break-all;
}

.skills-panel {
  padding: 20px 22px;
}

.tags-panel {
  padding: 20px 22px;
}

.p-color {
  width: 56px;
  padding: 4px;
  flex-shrink: 0;
}

.tag-edit-name {
  width: 160px;
}

.tag-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid var(--paper-border);
}

.gen-card {
  border: 1px dashed var(--paper-border);
  border-radius: var(--radius);
  padding: 16px 18px;
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

.gen-card h4 {
  margin: 0 0 10px;
  font-family: var(--font-serif);
}

.skills-title {
  margin: 22px 0 10px;
  font-family: var(--font-serif);
  font-size: 15px;
}

.skill-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skill-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid var(--paper-border);
  border-radius: 10px;
}

.skill-info {
  flex: 1;
  min-width: 0;
}

.skill-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.skill-name {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--accent);
}

.skill-desc {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: var(--paper-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-ops {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.modal.small {
  width: 460px;
}

.about-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.about-actions .spacer {
  flex: 1;
}

.about-saved {
  margin: 0;
  font-size: 13px;
  color: var(--success);
}

.picker-modal {
  width: 560px;
  max-width: 92vw;
  max-height: 80vh;
  overflow: auto;
}

.picker-modal .modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.picker-modal h3 {
  margin: 0;
  font-size: 15px;
}

.picker-modal .modal-close {
  border: none;
  background: transparent;
  color: var(--paper-muted);
  font-size: 15px;
  cursor: pointer;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px;
}

.picker-item {
  border: 2px solid var(--paper-border);
  border-radius: 8px;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  background: var(--paper-bg);
}

.picker-item:hover {
  border-color: var(--accent);
}

.picker-item img {
  display: block;
  width: 100%;
  height: 88px;
  object-fit: cover;
}
</style>
