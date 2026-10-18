import Link from 'next/link';
import { BRAND_BN } from '@/components/store/logo';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="font-brand text-5xl text-padma sm:text-6xl">{BRAND_BN}</p>
      <h1 className="mt-4 text-2xl font-bold">We couldn't find that page</h1>
      <p className="mt-1 max-w-sm text-ink-soft">The page may have moved or the link may be wrong. Try searching instead.</p>
      <div className="mt-6 flex gap-3">
        <Link href="/" className="rounded-md bg-padma px-5 py-2.5 font-semibold text-white hover:bg-padma-dark">
          Go to the home page
        </Link>
        <Link href="/search" className="rounded-md border border-line bg-white px-5 py-2.5 font-semibold hover:border-ink-faint">
          Browse products
        </Link>
      </div>
    </div>
  );
}
