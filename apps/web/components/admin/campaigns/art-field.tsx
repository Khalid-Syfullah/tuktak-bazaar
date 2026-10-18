'use client';

import { ImagePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useToast } from '@/components/providers';
import { errorMessage } from '@/components/admin/catalog/utils';
import { Button } from '@/components/ui';
import { uploadImage } from '@/lib/api';
import { CHECKER_STYLE } from './bits';

/** Optional banner art: upload, preview on a checkerboard (so transparency shows) and remove. */
export function ArtField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadImage(file));
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-ink">Banner art (optional)</span>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex aspect-[4/3] w-40 items-center justify-center overflow-hidden rounded-[6px] border border-dashed border-line" style={CHECKER_STYLE}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Banner art" className="size-full object-contain p-1" />
          ) : (
            <ImagePlus className="size-6 text-ink-faint" aria-hidden />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" loading={busy} onClick={() => input.current?.click()}>
            {value ? 'Replace art' : 'Upload art'}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>
              Remove
            </Button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/webp,image/jpeg,image/gif"
        className="sr-only"
        aria-label="Banner art file"
        tabIndex={-1}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <span className="mt-1 block text-xs text-ink-soft">Transparent PNG or WebP recommended, under 3 MB. It sits on the theme background beside the title.</span>
    </div>
  );
}
