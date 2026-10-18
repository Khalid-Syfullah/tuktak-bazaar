'use client';

import { Copy, LogOut, Share2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSession, useToast } from '@/components/providers';
import { Button, type ButtonProps } from '@/components/ui';
import { post } from '@/lib/api';

/**
 * Sends an invoice's share link: the phone's share sheet where there is one (WhatsApp, Messenger…),
 * otherwise copies it. `mode="copy"` always copies, for staff pasting it into a chat.
 */
export function InvoiceLinkButton({
  url,
  orderNo,
  mode = 'share',
  ...rest
}: { url: string; orderNo: string; mode?: 'share' | 'copy' } & Omit<ButtonProps, 'onClick' | 'children'>) {
  const toast = useToast();

  async function send() {
    if (mode === 'share' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `Invoice ${orderNo}`, url });
        return;
      } catch (e) {
        // Closing the share sheet is not an error; anything else falls back to copying.
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Invoice link copied. Anyone with this link can open the invoice.');
    } catch {
      toast('Could not copy the link. Open the invoice and copy the address from the browser instead.', 'error');
    }
  }

  return (
    <Button variant="outline" {...rest} onClick={send}>
      {mode === 'share' ? <Share2 className="size-4" /> : <Copy className="size-4" />}
      {mode === 'share' ? 'Share invoice' : 'Copy invoice link'}
    </Button>
  );
}

/** Logs out, then opens the login page so the right account can open `next`. */
export function SwitchAccountButton({ next }: { next: string }) {
  const router = useRouter();
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await post('/auth/logout');
          await refresh();
        } finally {
          router.push(`/login?next=${encodeURIComponent(next)}`);
        }
      }}
    >
      <LogOut className="size-4" /> Switch account
    </Button>
  );
}
