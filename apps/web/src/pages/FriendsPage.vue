<script setup lang="ts">
import type { FriendLink } from '@myblog/shared';
import { computed, onMounted, ref } from 'vue';
import { getFriends, type FriendsConfig } from '../api/friends';

const data = ref<FriendsConfig>({ title: '友链', intro: '', applyHint: '', links: [] });
const loading = ref(true);

const PALETTE = ['#c9a66b', '#8c9e7a', '#a38bb8', '#7a9bb8', '#b8827a', '#7aa89b'];

/** 头像加载失败 → 回退到首字占位 */
const broken = ref<Record<string, boolean>>({});

function avatarBg(link: FriendLink): { background: string } {
  const hash = [...link.name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return { background: PALETTE[hash % PALETTE.length] };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const links = computed(() => data.value.links ?? []);

onMounted(async () => {
  try {
    data.value = await getFriends();
  } catch {
    /* 读取失败时展示空状态 */
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="container friends-page">
    <header class="friends-head card">
      <h1 class="page-title">{{ data.title || '友链' }}</h1>
      <p v-if="data.intro" class="intro">{{ data.intro }}</p>
    </header>

    <p v-if="loading" class="empty">加载中…</p>

    <section v-else-if="links.length" class="friend-grid">
      <a
        v-for="link in links"
        :key="link.url"
        class="friend-card card"
        :href="link.url"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="avatar" :style="avatarBg(link)">
          <img
            v-if="link.avatar && !broken[link.url]"
            class="avatar-img"
            :src="link.avatar"
            :alt="link.name"
            loading="lazy"
            @error="broken[link.url] = true"
          />
          <span v-else class="avatar-char">{{ link.name.slice(0, 1) }}</span>
        </span>
        <span class="info">
          <span class="name-line">
            <span class="name">{{ link.name }}</span>
            <span class="host">{{ hostOf(link.url) }}</span>
          </span>
          <span class="desc">{{ link.description || '（TA 还没有写简介）' }}</span>
        </span>
      </a>
    </section>

    <p v-else class="empty">
      还没有友链 —— 在「管理 → 友链」里添加，或直接编辑 config/friends.json。
    </p>

    <section v-if="data.applyHint" class="apply-card card">
      <h2>🔗 交换友链</h2>
      <p class="apply-hint">{{ data.applyHint }}</p>
    </section>
  </div>
</template>

<style scoped>
.friends-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.friends-head {
  padding: 32px 26px;
  text-align: center;
}

.page-title {
  margin: 0 0 8px;
  font-family: var(--font-serif);
  font-size: 30px;
  letter-spacing: 4px;
}

.intro {
  margin: 0;
  font-size: 14px;
  color: var(--paper-muted);
  line-height: 1.8;
}

.friend-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.friend-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  min-width: 0;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease;
}

.friend-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
  text-decoration: none;
}

.avatar {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-char {
  font-family: var(--font-serif);
  font-size: 22px;
  color: rgba(255, 250, 240, 0.95);
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.name-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.name {
  font-family: var(--font-serif);
  font-size: 16px;
  color: var(--paper-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.host {
  font-size: 11.5px;
  color: var(--paper-muted);
  flex-shrink: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desc {
  font-size: 12.5px;
  color: var(--paper-muted);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.apply-card {
  padding: 22px 26px;
}

.apply-card h2 {
  margin: 0 0 8px;
  font-family: var(--font-serif);
  font-size: 17px;
}

.apply-hint {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.9;
  color: var(--paper-muted);
  white-space: pre-wrap;
  word-break: break-word;
}

.empty {
  color: var(--paper-muted);
  text-align: center;
  padding: 48px 0;
}

@media (max-width: 640px) {
  .friends-head {
    padding: 24px 18px;
  }

  .page-title {
    font-size: 24px;
    letter-spacing: 2px;
  }

  .friend-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .apply-card {
    padding: 18px 18px;
  }
}
</style>
