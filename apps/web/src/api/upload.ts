import type { UploadResultItem } from '@myblog/shared';
import { useAdminStore } from '../stores/admin';

export interface UploadResponse {
  results: UploadResultItem[];
}

/**
 * 上传文件（XHR 以便上报进度）。
 * 服务端逐文件返回结果：单文件失败不影响批次；401 时弹出口令框并重试。
 */
export function uploadFiles(
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<UploadResponse> {
  const admin = useAdminStore();
  const form = new FormData();
  files.forEach((f) => form.append('files', f, f.name));
  return attemptUpload(form, admin.token, onProgress);
}

function attemptUpload(
  form: FormData,
  token: string,
  onProgress?: (percent: number) => void,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    if (token) xhr.setRequestHeader('x-admin-token', token);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 401) {
        const admin = useAdminStore();
        admin.clearToken();
        void admin.ensureToken().then((next) => {
          if (!next) {
            reject(new Error('需要管理口令'));
            return;
          }
          attemptUpload(form, next, onProgress).then(resolve).catch(reject);
        });
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as UploadResponse);
      } catch {
        reject(new Error('上传响应解析失败'));
      }
    };
    xhr.onerror = () => reject(new Error('网络错误，上传失败'));
    xhr.send(form);
  });
}
