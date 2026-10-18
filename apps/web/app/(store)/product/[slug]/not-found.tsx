import Link from 'next/link';

/** A product link that no longer works: usually the product was removed or its link changed. */
export default function ProductNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <h1 className="text-2xl font-bold">We couldn&apos;t find that product</h1>
      <p className="mt-1 text-ink-soft">It may have sold out or the link may be wrong. Try searching instead.</p>
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
