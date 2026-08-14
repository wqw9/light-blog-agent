import { defineStore } from 'pinia';
import { undoArticle } from '../api/articles';

export interface UndoOp {
  articleId: number;
  title: string;
  action: string;
  at: number;
}

const KEY = 'mb-undo-stack';
const MAX_OPS = 20;

function loadStack(): UndoOp[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw as UndoOp[]) : [];
  } catch {
    return [];
  }
}

function save(stack: UndoOp[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stack));
  } catch {
    /* ignore */
  }
}

/**
 * 操作撤销栈（Ctrl+Z）：
 * - 管理页/书页每次 编辑/状态切换/删除 成功后 pushOp
 * - 全局 Ctrl+Z（输入框内不拦截）→ performUndo → 调用服务端 undo 回滚/重建
 * - 撤销失败（如口令错误）时操作保留在栈中，可重试
 */
export const useUndoStore = defineStore('undo', {
  state: () => ({
    stack: loadStack(),
    chipOpen: false,
    toast: '',
    chipTimer: undefined as number | undefined,
  }),
  getters: {
    lastOp: (state): UndoOp | null => state.stack[state.stack.length - 1] ?? null,
  },
  actions: {
    pushOp(op: UndoOp) {
      this.stack = [...this.stack.slice(-(MAX_OPS - 1)), op];
      save(this.stack);
      this.showChip();
    },
    showChip() {
      this.chipOpen = true;
      if (this.chipTimer) window.clearTimeout(this.chipTimer);
      this.chipTimer = window.setTimeout(() => {
        this.chipOpen = false;
      }, 12000);
    },
    async performUndo(): Promise<boolean> {
      const op = this.lastOp;
      if (!op) return false;
      try {
        await undoArticle(op.articleId);
        this.stack = this.stack.slice(0, -1);
        save(this.stack);
        this.chipOpen = false;
        this.toast = `已撤销「${op.title}」的${op.action}`;
        window.setTimeout(() => {
          this.toast = '';
        }, 4000);
        window.dispatchEvent(new CustomEvent('mb-undo-done', { detail: { articleId: op.articleId, title: op.title } }));
        return true;
      } catch {
        // 失败（401 会弹管理口令框）时操作保留在栈中
        return false;
      }
    },
  },
});
