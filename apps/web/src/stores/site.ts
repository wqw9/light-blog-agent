import type { SiteConfig } from '@myblog/shared';
import { defineStore } from 'pinia';
import { request } from '../api/client';

const DEFAULT: SiteConfig = {
  name: '拾页书阁',
  signature: '',
  description: '',
  nav: [],
  backgroundImage: '',
};

export const useSiteStore = defineStore('site', {
  state: () => ({ ...DEFAULT, loaded: false }),
  actions: {
    async load() {
      if (this.loaded) return;
      try {
        const site = await request<SiteConfig>('/api/site');
        Object.assign(this, { ...site, loaded: true });
      } catch {
        Object.assign(this, { ...DEFAULT, loaded: true });
      }
    },
    /** 保存站点背景图（管理页） */
    async saveBackground(url: string): Promise<void> {
      const site = await request<SiteConfig>('/api/site', {
        method: 'PUT',
        body: JSON.stringify({ backgroundImage: url }),
      });
      this.backgroundImage = site.backgroundImage ?? '';
    },
  },
});
