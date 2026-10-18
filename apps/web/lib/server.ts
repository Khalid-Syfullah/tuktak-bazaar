import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

const API_URL = process.env.API_URL || 'http://localhost:4000';

/**
 * Server-side fetch to the API, forwarding the visitor's auth cookie.
 * Returns null on 404 so pages can call notFound().
 */
async function cookieHeader(): Promise<string> {
  const jar = await cookies();
  return jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

export async function serverApi<T = any>(path: string, opts: { revalidate?: number } = {}): Promise<T | null> {
  const cookie = await cookieHeader();
  const res = await fetch(`${API_URL}/api${path}`, {
    headers: cookie ? { cookie } : {},
    cache: opts.revalidate ? 'force-cache' : 'no-store',
    next: opts.revalidate ? { revalidate: opts.revalidate } : undefined,
  });
  if (res.status === 404) return null;
  if (res.status === 401) return null;
  // A staff member opened a part of the admin panel their account can't use
  if (res.status === 403 && path.startsWith('/admin')) redirect('/admin/no-access');
  if (!res.ok) throw new Error(`API ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}

/** Like serverApi, but hands back the status so a page can tell "log in first" (401) from "not found" (404). */
export async function serverGet<T = any>(path: string): Promise<{ status: number; data: T | null }> {
  const cookie = await cookieHeader();
  const res = await fetch(`${API_URL}/api${path}`, { headers: cookie ? { cookie } : {}, cache: 'no-store' });
  if (res.status === 401 || res.status === 404) return { status: res.status, data: null };
  if (!res.ok) throw new Error(`API ${path} failed with ${res.status}`);
  return { status: res.status, data: (await res.json()) as T };
}

export async function mustGet<T = any>(path: string): Promise<T> {
  const data = await serverApi<T>(path);
  if (!data) notFound();
  return data;
}

export type Permission = 'CATALOG' | 'ORDERS' | 'MARKETING' | 'SUPPORT' | 'REPORTS' | 'SETTINGS';

export interface Me {
  user: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
    coins: number;
    /** Every permission for owners, the granted ones for staff, none for customers. */
    permissions: Permission[];
    marketingSms: boolean;
  } | null;
  unreadNotifications?: number;
  cartCount?: number;
}

export async function getMe(): Promise<Me> {
  return (await serverApi<Me>('/auth/me')) ?? { user: null };
}

/** Redirects to login (and back afterwards) when nobody is signed in. */
export async function requireUser(next: string) {
  const me = await getMe();
  if (!me.user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return me;
}
