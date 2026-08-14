import { useAdminStore } from '../stores/admin';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildHeaders(init: RequestInit, token: string): Record<string, string> {
  const isForm = init.body instanceof FormData;
  return {
    Accept: 'application/json',
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { 'x-admin-token': token } : {}),
    ...(init.headers ?? {}),
  } as Record<string, string>;
}

async function parseError(res: Response): Promise<string> {
  let message = `请求失败 (${res.status})`;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (body?.message) message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
  } catch {
    /* ignore */
  }
  return message;
}

/**
 * 统一请求封装：自动携带管理口令；遇 401 弹出口令框并重试一次。
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const admin = useAdminStore();

  let res = await fetch(path, { ...init, headers: buildHeaders(init, admin.token) });

  if (res.status === 401) {
    admin.clearToken();
    const token = await admin.ensureToken();
    if (token) {
      res = await fetch(path, { ...init, headers: buildHeaders(init, token) });
    }
  }

  if (!res.ok) {
    const message = await parseError(res);
    if (res.status === 401) admin.fail(message); // 口令错误：清 token 并保持弹窗
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}
