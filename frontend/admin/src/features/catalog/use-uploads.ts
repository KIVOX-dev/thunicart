import { useCallback, useRef, useState } from 'react';
import { api } from '../api/http';

export interface UploadEntry { id: string; name: string; status: 'uploading' | 'done' | 'error'; progress: number; key?: string; previewUrl?: string; error?: string }

/** Uploads straight to storage: ask the API for a presigned URL, PUT the file from the browser, return the file key. */
export async function uploadFile(file: File, kind: string, onProgress: (pct: number) => void): Promise<string> {
  const { uploadUrl, key } = await api.post<{ uploadUrl: string; key: string }>('/uploads/presign', { filename: file.name, contentType: file.type || 'application/octet-stream', kind });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? (onProgress(100), resolve()) : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    xhr.send(file);
  });
  return key;
}

interface Media { imageKeys: string[]; videoKey: string | null; sizeChartKey: string | null }

/** Image, video and size chart uploads with progress, retry and image reordering. */
export function useMediaUploads(initial: Media) {
  const [imageKeys, setImageKeys] = useState<string[]>(initial.imageKeys);
  const [videoKey, setVideoKey] = useState<string | null>(initial.videoKey);
  const [sizeChartKey, setSizeChartKey] = useState<string | null>(initial.sizeChartKey);
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const previews = useRef<Record<string, string>>({});
  const files = useRef<Record<string, { file: File; kind: string }>>({});

  const patch = (id: string, p: Partial<UploadEntry>) => setEntries((s) => s.map((e) => (e.id === id ? { ...e, ...p } : e)));
  const run = useCallback(async (id: string, file: File, kind: string) => {
    patch(id, { status: 'uploading', progress: 0, error: undefined });
    try {
      const key = await uploadFile(file, kind, (progress) => patch(id, { progress }));
      if (kind === 'image') { previews.current[key] = URL.createObjectURL(file); setImageKeys((k) => [...k, key]); }
      if (kind === 'video') setVideoKey(key);
      if (kind === 'size-chart') setSizeChartKey(key);
      patch(id, { status: 'done', progress: 100, key });
    } catch (e) {
      patch(id, { status: 'error', error: (e as Error).message });
    }
  }, []);

  const add = (list: FileList | File[], kind: 'image' | 'video' | 'size-chart') => {
    for (const file of Array.from(list)) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      files.current[id] = { file, kind };
      setEntries((s) => [...s, { id, name: file.name, status: 'uploading', progress: 0, previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined }]);
      void run(id, file, kind);
    }
  };
  const retry = (id: string) => { const f = files.current[id]; if (f) void run(id, f.file, f.kind); };
  const dismiss = (id: string) => setEntries((s) => s.filter((e) => e.id !== id));
  const move = (from: number, to: number) => setImageKeys((k) => {
    if (to < 0 || to >= k.length) return k;
    const n = [...k]; const [m] = n.splice(from, 1); n.splice(to, 0, m!); return n;
  });
  return {
    imageKeys, videoKey, sizeChartKey, entries, add, retry, dismiss, move,
    removeImage: (key: string) => setImageKeys((k) => k.filter((x) => x !== key)),
    clearVideo: () => setVideoKey(null), clearSizeChart: () => setSizeChartKey(null),
    previewOf: (key: string) => previews.current[key],
    busy: entries.some((e) => e.status === 'uploading'),
  };
}
