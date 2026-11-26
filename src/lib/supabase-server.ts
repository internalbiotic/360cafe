import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cachedServerClient: SupabaseClient | null = null;
let cachedConfigKey = '';

function getSupabaseEnv() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const key = (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim();
  return { url, key };
}

export function isSupabaseServerConfigured(): boolean {
  const { url, key } = getSupabaseEnv();
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      key.length > 0 &&
      !url.includes('YOUR_PROJECT_REF') &&
      !key.includes('YOUR_SUPABASE')
    );
  } catch {
    return false;
  }
}

export function getSupabaseServerClient(): SupabaseClient | null {
  if (!isSupabaseServerConfigured()) return null;
  const { url, key } = getSupabaseEnv();
  const configKey = `${url}::${key}`;
  if (!cachedServerClient || cachedConfigKey !== configKey) {
    cachedServerClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    cachedConfigKey = configKey;
  }
  return cachedServerClient;
}

export interface VerifiedAuthUser {
  uid: string;
  email: string;
  name?: string;
  provider: 'supabase' | 'firebase';
}

export async function verifySupabaseToken(
  token: string
): Promise<VerifiedAuthUser | null> {
  const client = getSupabaseServerClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;

  const meta = data.user.user_metadata || {};
  const displayName =
    typeof meta.full_name === 'string'
      ? meta.full_name
      : typeof meta.name === 'string'
        ? meta.name
        : undefined;

  return {
    uid: `sb:${data.user.id}`,
    email: (data.user.email || '').toLowerCase(),
    name: displayName,
    provider: 'supabase',
  };
}

export async function checkSupabaseConnection(): Promise<{
  configured: boolean;
  reachable: boolean;
  message: string;
}> {
  if (!isSupabaseServerConfigured()) {
    return {
      configured: false,
      reachable: false,
      message:
        'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY environment variables.',
    };
  }

  const { url, key } = getSupabaseEnv();
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/settings`, {
      headers: { apikey: key },
    });
    if (!res.ok) {
      return {
        configured: true,
        reachable: false,
        message: `Supabase project responded with HTTP ${res.status}. Verify your Project URL and Publishable Key.`,
      };
    }
    return {
      configured: true,
      reachable: true,
      message: 'Connected to Supabase Auth successfully.',
    };
  } catch {
    return {
      configured: true,
      reachable: false,
      message: 'Could not reach the configured Supabase Project URL.',
    };
  }
}
