import { useRef } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { Button } from '@thunikart/ui';
import type { useMediaUploads } from '../features/catalog/use-uploads';

type Media = ReturnType<typeof useMediaUploads>;
const fileName = (key: string) => key.split('/').pop() ?? key;

/** Images (reorder by drag or the arrow buttons), one video and a size chart. Files upload straight to storage with progress and retry. */
export function MediaManager({ media }: { media: Media }) {
  const drag = useRef<number | null>(null);
  const pick = (kind: 'image' | 'video' | 'size-chart', accept: string, multiple = false) => (
    <label className="inline-flex min-h-11 cursor-pointer items-center rounded border border-navy px-4 text-sm font-medium uppercase tracking-wider hover:bg-mist focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-teal">
      {kind === 'image' ? 'Add images' : kind === 'video' ? 'Add video' : 'Add size chart'}
      <input type="file" accept={accept} multiple={multiple} className="sr-only" aria-label={kind === 'image' ? 'Add images' : kind === 'video' ? 'Add video' : 'Add size chart'} onChange={(e) => { if (e.target.files) media.add(e.target.files, kind); e.target.value = ''; }} />
    </label>
  );
  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Images">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-xs">Images</h3>{pick('image', 'image/*', true)}</div>
        <p className="mb-2 text-xs text-muted">The first image is the main one. Drag to reorder, or use the arrows.</p>
        {media.imageKeys.length === 0 ? <p className="rounded border border-dashed border-line p-4 text-center text-sm text-muted">No images yet.</p> : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {media.imageKeys.map((k, i) => (
              <li key={k} draggable onDragStart={() => { drag.current = i; }} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag.current !== null) media.move(drag.current, i); drag.current = null; }} className="rounded border-2 border-navy-100 p-2">
                <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded bg-mist">
                  {media.previewOf(k) ? <img src={media.previewOf(k)} alt={`Image ${i + 1}`} className="h-full w-full object-cover" /> : <span className="px-2 text-center text-xs text-muted">{fileName(k)}</span>}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs">{i === 0 ? 'Main' : `#${i + 1}`}</span>
                  <span className="flex">
                    <button type="button" aria-label={`Move image ${i + 1} earlier`} disabled={i === 0} onClick={() => media.move(i, i - 1)} className="flex h-11 w-9 items-center justify-center disabled:opacity-30"><ArrowUp size={16} /></button>
                    <button type="button" aria-label={`Move image ${i + 1} later`} disabled={i === media.imageKeys.length - 1} onClick={() => media.move(i, i + 1)} className="flex h-11 w-9 items-center justify-center disabled:opacity-30"><ArrowDown size={16} /></button>
                    <button type="button" aria-label={`Remove image ${i + 1}`} onClick={() => media.removeImage(k)} className="flex h-11 w-9 items-center justify-center text-danger"><Trash2 size={16} /></button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Video" className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-xs">Video</h3><p className="text-sm text-muted">{media.videoKey ? fileName(media.videoKey) : 'No video'}</p></div>
        <span className="flex gap-2">{media.videoKey && <Button onClick={media.clearVideo}>Remove</Button>}{pick('video', 'video/*')}</span>
      </section>
      <section aria-label="Size chart" className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-xs">Size chart</h3><p className="text-sm text-muted">{media.sizeChartKey ? fileName(media.sizeChartKey) : 'No size chart'}</p></div>
        <span className="flex gap-2">{media.sizeChartKey && <Button onClick={media.clearSizeChart}>Remove</Button>}{pick('size-chart', 'image/*,application/pdf')}</span>
      </section>
      {media.entries.length > 0 && (
        <ul aria-label="Uploads" className="flex flex-col gap-2">
          {media.entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded border-2 border-navy-100 p-2 text-sm">
              {e.previewUrl && <img src={e.previewUrl} alt="" className="h-10 w-10 rounded object-cover" />}
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              {e.status === 'uploading' && <span role="progressbar" aria-valuenow={e.progress} aria-valuemin={0} aria-valuemax={100} className="text-xs text-muted">Uploading {e.progress}%</span>}
              {e.status === 'done' && <><span className="text-xs">Uploaded</span><button type="button" onClick={() => media.dismiss(e.id)} className="min-h-11 px-2 text-xs underline">Dismiss</button></>}
              {e.status === 'error' && <><span role="alert" className="text-xs text-danger">{e.error}</span><Button size="sm" onClick={() => media.retry(e.id)}>Retry</Button></>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
