import { defineStore } from 'pinia';

const TOKEN_KEY = 'mb-admin-token';

type Resolver = (token: string | null) => void;

/**
 * 管理口令状态：token 保存在 sessionStorage ——
 * 同一标签页内刷新不丢，关闭标签页/浏览器即自动清除（安全要求：退出网页清除口令）。
 * 旧版 localStorage 中的口令自动迁移清除。
 */
function readToken(): string {
  try {
    localStorage.removeItem(TOKEN_KEY); // 迁移清理旧持久化口令（新版仅会话内保存）
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

function clearTokenStorage(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY); // 迁移清理旧持久化口令
  } catch {
    /* ignore */
  }
}

export const useAdminStore = defineStore('admin', {
  state: () => ({
    token: readToken(),
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
      writeToken(token);
    },
    clearToken() {
      this.token = '';
      clearTokenStorage();
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
