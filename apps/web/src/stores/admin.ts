import { defineStore } from 'pinia';

const TOKEN_KEY = 'mb-admin-token';

type Resolver = (token: string | null) => void;

/**
 * 管理口令状态：token 保存在 localStorage；
 * 写接口 401 时弹出统一的口令弹窗，输入后自动重试（见 api/client.ts）。
 */
export const useAdminStore = defineStore('admin', {
  state: () => ({
    token: (() => {
      try {
        return localStorage.getItem(TOKEN_KEY) ?? '';
      } catch {
        return '';
      }
    })(),
    dialogOpen: false,
    error: '',
    _resolve: null as Resolver | null,
  }),
  getters: {
    hasToken: (state): boolean => Boolean(state.token),
  },
  actions: {
    setToken(token: string) {
      this.token = token;
      try {
        localStorage.setItem(TOKEN_KEY, token);
      } catch {
        /* ignore */
      }
    },
    clearToken() {
      this.token = '';
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {
        /* ignore */
      }
    },
    /** 无 token 时打开口令弹窗；resolve 用户输入（取消返回 null） */
    ensureToken(): Promise<string | null> {
      if (this.token) return Promise.resolve(this.token);
      return new Promise<string | null>((resolve) => {
        this.error = '';
        this.dialogOpen = true;
        this._resolve = resolve;
      });
    },
    submit(password: string) {
      this.setToken(password);
      this.dialogOpen = false;
      const r = this._resolve;
      this._resolve = null;
      r?.(password);
    },
    cancel() {
      this.dialogOpen = false;
      const r = this._resolve;
      this._resolve = null;
      r?.(null);
    },
    /** 口令错误：清空 token、显示错误并保持弹窗 */
    fail(message: string) {
      this.clearToken();
      this.error = message;
      this.dialogOpen = true;
    },
    logout() {
      this.clearToken();
    },
  },
});
