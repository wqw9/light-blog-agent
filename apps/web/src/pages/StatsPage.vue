<script setup lang="ts">
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, PieChart } from 'echarts/charts';
import {
  CalendarComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { request } from '../api/client';
import { listTags } from '../api/articles';
import type { ArticleSummary } from '@myblog/shared';

echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  CalendarComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

interface Overview {
  articleTotal: number;
  publishedTotal: number;
  draftTotal: number;
  uploadTotal: number;
  tagTotal: number;
  wordTotal: number;
  avgWords: number;
  viewTotal: number;
  readSecondsTotal: number;
  thisMonthNew: number;
}

const overview = ref<Overview | null>(null);
const topArticles = ref<ArticleSummary[]>([]);
const error = ref('');

const heatmapEl = ref<HTMLDivElement | null>(null);
const monthlyEl = ref<HTMLDivElement | null>(null);
const tagsEl = ref<HTMLDivElement | null>(null);

const charts: echarts.ECharts[] = [];

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#8d8372';
}

function initChart(el: HTMLDivElement | null): echarts.ECharts | null {
  if (!el) return null;
  const chart = echarts.init(el);
  charts.push(chart);
  return chart;
}

async function load(): Promise<void> {
  error.value = '';
  try {
    const [ov, hm, mo, tags, top] = await Promise.all([
      request<Overview>('/api/stats/overview'),
      request<{ days: { date: string; count: number }[] }>('/api/stats/heatmap'),
      request<{ months: { month: string; count: number; words: number }[] }>('/api/stats/monthly'),
      listTags(),
      request<{ items: ArticleSummary[] }>('/api/articles?pageSize=5&sort=views'),
    ]);
    overview.value = ov;
    topArticles.value = top.items.filter((a) => a.viewCount > 0);

    const fg = cssVar('--paper-fg');
    const muted = cssVar('--paper-muted');
    const border = cssVar('--paper-border');
    const accent = '#8c5a2b';

    // 发布热力图（GitHub 风格）
    const max = Math.max(1, ...hm.days.map((d) => d.count));
    initChart(heatmapEl.value)?.setOption({
      tooltip: { formatter: (p: { data: [string, number] }) => `${p.data[0]} · ${p.data[1]} 篇` },
      visualMap: {
        min: 0,
        max,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        inRange: { color: ['#eee5d2', '#d9b98c', accent] },
        textStyle: { color: muted },
      },
      calendar: {
        range: [hm.days[0]?.date, hm.days[hm.days.length - 1]?.date],
        cellSize: ['auto', 13],
        dayLabel: { nameMap: 'cn', color: muted },
        monthLabel: { nameMap: 'cn', color: muted },
        yearLabel: { show: false },
        itemStyle: { borderWidth: 2, borderColor: 'transparent', color: '#eee5d2' },
        splitLine: { show: false },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: hm.days.map((d) => [d.date, d.count]),
        },
      ],
    });

    // 月度趋势
    initChart(monthlyEl.value)?.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['篇数', '字数'], textStyle: { color: muted }, top: 0 },
      grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
      xAxis: {
        type: 'category',
        data: mo.months.map((m) => m.month.slice(2)),
        axisLabel: { color: muted },
        axisLine: { lineStyle: { color: border } },
      },
      yAxis: [
        { type: 'value', name: '篇', axisLabel: { color: muted }, splitLine: { lineStyle: { color: border } } },
        { type: 'value', name: '字', axisLabel: { color: muted }, splitLine: { show: false } },
      ],
      series: [
        { name: '篇数', type: 'bar', data: mo.months.map((m) => m.count), itemStyle: { color: accent }, barMaxWidth: 22 },
        {
          name: '字数',
          type: 'line',
          yAxisIndex: 1,
          data: mo.months.map((m) => m.words),
          lineStyle: { color: '#4a7c4f' },
          itemStyle: { color: '#4a7c4f' },
        },
      ],
    });

    // 标签分布
    const tagTop = tags.slice(0, 10);
    initChart(tagsEl.value)?.setOption({
      tooltip: { trigger: 'item' },
      legend: { type: 'scroll', orient: 'vertical', right: 0, top: 'middle', textStyle: { color: muted } },
      series: [
        {
          type: 'pie',
          radius: ['38%', '68%'],
          center: ['38%', '50%'],
          data: tagTop.map((t) => ({ name: t.name, value: t.count })),
          label: { color: muted },
          itemStyle: { borderColor: cssVar('--card-bg'), borderWidth: 2 },
          color: ['#8c5a2b', '#a38bb8', '#4a7c4f', '#3d6ea5', '#b8827a', '#7aa89b', '#c9a66b', '#8c9e7a', '#7a9bb8', '#a2503a'],
        },
      ],
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : '统计加载失败';
  }
}

function onResize(): void {
  charts.forEach((c) => c.resize());
}

onMounted(() => {
  void load();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  charts.forEach((c) => c.dispose());
});

function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 分钟';
  if (seconds < 60) return `${seconds} 秒`;
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} 分钟`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}
</script>

<template>
  <div class="container stats-page">
    <h2 class="page-title">统计</h2>

    <p v-if="error" class="error-banner">{{ error }}</p>

    <div v-if="overview" class="cards">
      <div class="stat-card card">
        <span class="num">{{ overview.articleTotal }}</span>
        <span class="label">文章总数</span>
      </div>
      <div class="stat-card card">
        <span class="num">{{ overview.wordTotal }}</span>
        <span class="label">总字数</span>
      </div>
      <div class="stat-card card">
        <span class="num">{{ overview.viewTotal }}</span>
        <span class="label">总阅读</span>
      </div>
      <div class="stat-card card">
        <span class="num">{{ fmtDuration(overview.readSecondsTotal) }}</span>
        <span class="label">累计阅读时长</span>
      </div>
      <div class="stat-card card">
        <span class="num">{{ overview.thisMonthNew }}</span>
        <span class="label">本月新增</span>
      </div>
      <div class="stat-card card">
        <span class="num">{{ overview.tagTotal }}</span>
        <span class="label">标签数</span>
      </div>
    </div>

    <section class="chart-card card">
      <h3>发布热力图（近一年）</h3>
      <div ref="heatmapEl" class="chart heatmap"></div>
    </section>

    <div class="chart-row">
      <section class="chart-card card">
        <h3>月度趋势（近一年）</h3>
        <div ref="monthlyEl" class="chart"></div>
      </section>
      <section class="chart-card card">
        <h3>标签分布</h3>
        <div ref="tagsEl" class="chart"></div>
      </section>
    </div>

    <section class="chart-card card">
      <h3>阅读排行</h3>
      <ol v-if="topArticles.length" class="top-list">
        <li v-for="(a, i) in topArticles" :key="a.id">
          <span class="rank">{{ i + 1 }}</span>
          <RouterLink :to="`/read/${a.slug}`" class="top-title">{{ a.title }}</RouterLink>
          <span class="top-meta">{{ a.viewCount }} 次阅读 · {{ a.wordCount }} 字</span>
        </li>
      </ol>
      <p v-else class="empty">还没有阅读数据 —— 分享文章、多读几遍就会有啦。</p>
    </section>
  </div>
</template>

<style scoped>
.page-title {
  font-family: var(--font-serif);
  margin: 0 0 18px;
}

.error-banner {
  margin: 0 0 14px;
  padding: 10px 14px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
  font-size: 13px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.stat-card {
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.num {
  font-family: var(--font-serif);
  font-size: 26px;
  color: var(--accent);
  font-weight: 700;
}

.label {
  font-size: 12.5px;
  color: var(--paper-muted);
}

.chart-card {
  padding: 18px 22px;
  margin-bottom: 18px;
}

.chart-card h3 {
  margin: 0 0 12px;
  font-family: var(--font-serif);
  font-size: 16px;
}

.chart {
  width: 100%;
  height: 280px;
}

.chart.heatmap {
  height: 180px;
}

.chart-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

@media (max-width: 900px) {
  .chart-row {
    grid-template-columns: 1fr;
  }
}

.top-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.top-list li {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--paper-border);
  font-size: 14px;
}

.top-list li:last-child {
  border-bottom: none;
}

.rank {
  font-family: var(--font-mono);
  color: var(--accent);
  font-weight: 700;
  width: 22px;
  text-align: center;
}

.top-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-meta {
  color: var(--paper-muted);
  font-size: 12.5px;
  white-space: nowrap;
}

.empty {
  color: var(--paper-muted);
  text-align: center;
  padding: 24px 0;
}
</style>
