'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders its children inside an iframe (through a portal, so React context still works) with the page's
 * stylesheets copied in. The iframe has its own viewport, so the storefront's phone and desktop layouts
 * respond to the frame width instead of the admin window. Clicks on links and form submits are blocked
 * so the preview never navigates the admin away.
 */
export function PreviewFrame({ width, title, children }: { width: number | '100%'; title: string; children: ReactNode }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(240);
  // Bumped when the browser swaps the iframe's document (some browsers load about:blank late), to set it up again.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const iframe = frame.current;
    const doc = iframe?.contentDocument;
    const win = iframe?.contentWindow as (Window & typeof globalThis) | null | undefined;
    if (!iframe || !doc || !win) return;
    doc.open();
    doc.write('<!doctype html><html lang="bn"><head><meta charset="utf-8"></head><body><div id="preview-root"></div></body></html>');
    doc.close();
    doc.documentElement.className = document.documentElement.className;
    doc.body.className = document.body.className;
    doc.body.style.margin = '0';
    doc.body.style.minHeight = '0';

    // Copy stylesheets now and again whenever the page's <head> changes (dev reloads, lazily loaded CSS).
    const copyStyles = () => {
      doc.head.querySelectorAll('[data-copied-style]').forEach((n) => n.remove());
      document.head.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => {
        const clone = n.cloneNode(true) as HTMLElement;
        clone.setAttribute('data-copied-style', '');
        doc.head.appendChild(clone);
      });
    };
    copyStyles();
    let pending: ReturnType<typeof setTimeout> | undefined;
    const headWatch = new MutationObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(copyStyles, 150);
    });
    headWatch.observe(document.head, { childList: true, subtree: true, characterData: true });

    const block = (e: Event) => {
      const el = e.target as Element | null;
      if (e.type === 'submit' || el?.closest?.('a[href]')) e.preventDefault();
    };
    doc.addEventListener('click', block, true);
    doc.addEventListener('submit', block, true);

    const root = doc.getElementById('preview-root')!;
    const RO = win.ResizeObserver ?? ResizeObserver;
    const sizeWatch = new RO(() => setHeight(Math.max(120, Math.ceil(root.getBoundingClientRect().height))));
    sizeWatch.observe(root);
    setMount(root);

    return () => {
      clearTimeout(pending);
      headWatch.disconnect();
      sizeWatch.disconnect();
      doc.removeEventListener('click', block, true);
      doc.removeEventListener('submit', block, true);
      setMount(null);
    };
  }, [generation]);

  return (
    <iframe
      ref={frame}
      title={title}
      className="block border-0 bg-paper"
      style={{ width: width === '100%' ? '100%' : `${width}px`, maxWidth: '100%', height }}
      onLoad={() => {
        if (!frame.current?.contentDocument?.getElementById('preview-root')) setGeneration((g) => g + 1);
      }}
    >
      {mount && createPortal(children, mount)}
    </iframe>
  );
}
