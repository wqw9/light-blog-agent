<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getAbout, type AboutData } from '../api/about';

const about = ref<AboutData | null>(null);

onMounted(async () => {
  try {
    about.value = await getAbout();
  } catch {
    /* ignore */
  }
});
</script>

<template>
  <div class="container about-page">
    <section class="hero card">
      <div class="avatar" :style="about?.avatar ? { backgroundImage: `url(${JSON.stringify(about.avatar)})` } : {}">
        <span v-if="!about?.avatar">{{ (about?.name || '我').slice(0, 1) }}</span>
      </div>
      <h1 class="name">{{ about?.name || '你的名字' }}</h1>
      <p class="signature">{{ about?.signature }}</p>
      <div v-if="about?.skills.length" class="skills">
        <span v-for="s in about.skills" :key="s" class="skill">{{ s }}</span>
      </div>
    </section>

    <section v-if="about?.timeline.length" class="timeline-card card">
      <h2>时间线</h2>
      <ul class="timeline">
        <li v-for="t in about.timeline" :key="t.year">
          <span class="year">{{ t.year }}</span>
          <span class="event">{{ t.event }}</span>
        </li>
      </ul>
    </section>

    <section v-if="about?.links.length" class="links-card card">
      <h2>找到我</h2>
      <div class="links">
        <a v-for="l in about.links" :key="l.label" class="btn" :href="l.url" target="_blank" rel="noreferrer">
          {{ l.label }}
        </a>
      </div>
    </section>

    <!-- 自由扩展内容（Markdown 渲染） -->
    <section v-if="about?.contentHtml" class="content-card card">
      <!-- 服务端渲染的安全 HTML -->
      <div class="chapter-body about-content" v-html="about.contentHtml"></div>
    </section>

    <p class="hint">内容来自 config/about.json —— 可在管理页「关于我」标签直接编辑，或改文件更新。</p>
  </div>
</template>

<style scoped>
.about-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 720px;
}

.hero {
  text-align: center;
  padding: 48px 24px 40px;
}

.avatar {
  width: 96px;
  height: 96px;
  margin: 0 auto 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--accent) 20%, var(--card-bg));
  color: var(--accent);
  font-family: var(--font-serif);
  font-size: 40px;
  background-size: cover;
  background-position: center;
}

.name {
  margin: 0 0 6px;
  font-family: var(--font-serif);
  font-size: 30px;
  letter-spacing: 2px;
}

.signature {
  margin: 0 0 16px;
  color: var(--accent);
  font-family: var(--font-serif);
}

.skills {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.skill {
  font-size: 13px;
  padding: 4px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}

.timeline-card,
.links-card {
  padding: 22px 26px;
}

.timeline-card h2,
.links-card h2 {
  margin: 0 0 14px;
  font-family: var(--font-serif);
  font-size: 18px;
}

.timeline {
  list-style: none;
  margin: 0;
  padding: 0 0 0 18px;
  border-left: 2px solid var(--paper-border);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.timeline li {
  display: flex;
  gap: 14px;
  align-items: baseline;
}

.year {
  font-family: var(--font-mono);
  color: var(--accent);
  font-weight: 700;
  flex-shrink: 0;
}

.event {
  font-size: 14px;
}

.links {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.hint {
  text-align: center;
  color: var(--paper-muted);
  font-size: 12.5px;
}

.content-card {
  padding: 30px 40px;
}

@media (max-width: 720px) {
  .content-card {
    padding: 22px 18px;
  }
}

.about-content p:first-child {
  margin-top: 0;
}
</style>
