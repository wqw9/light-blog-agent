import { defineStore } from 'pinia';

export type ThemeId = 'paper' | 'white' | 'green' | 'night';

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'paper', label: '米黄纸' },
  { id: 'white', label: '纸白' },
  { id: 'green', label: '护眼绿' },
  { id: 'night', label: '夜间' },
];

export const FONT_SIZES = [15, 16, 18, 20];

function read(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** 阅读偏好：主题 / 字号 / 沉浸模式（设计文档 5.7.4） */
export const useReaderStore = defineStore('reader', {
  state: () => ({
    theme: read('mb-theme', 'paper') as ThemeId,
    fontIndex: Number(read('mb-font', '1')),
    immersive: false,
  }),
  getters: {
    fontSize: (state): number => FONT_SIZES[state.fontIndex] ?? 16,
    themeList: () => THEMES,
  },
  actions: {
    applyTheme() {
      document.documentElement.setAttribute('data-theme', this.theme);
    },
    setTheme(theme: ThemeId) {
      this.theme = theme;
      write('mb-theme', theme);
      this.applyTheme();
    },
    increaseFont() {
      if (this.fontIndex < FONT_SIZES.length - 1) {
        this.fontIndex++;
        write('mb-font', String(this.fontIndex));
      }
    },
    decreaseFont() {
      if (this.fontIndex > 0) {
        this.fontIndex--;
        write('mb-font', String(this.fontIndex));
      }
    },
    toggleImmersive() {
      this.setImmersive(!this.immersive);
    },
    setImmersive(on: boolean) {
      this.immersive = on;
      document.body.classList.toggle('immersive', on);
    },
  },
});
