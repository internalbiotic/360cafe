import { Request, Response, NextFunction } from 'express';
import { eq, or } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { VerifiedAuthUser, verifySupabaseToken } from '../lib/supabase-server.ts';
import { db } from '../db/index.ts';
import { profiles } from '../db/schema.ts';
import type { UserRole } from '../types.ts';

const VALID_ROLES = new Set<UserRole>(['owner', 'admin', 'staff', 'customer']);

export function normalizeRole(role: unknown): UserRole {
  if (typeof role === 'string' && VALID_ROLES.has(role as UserRole)) {
    return role as UserRole;
  }
  return 'customer';
}

export interface AuthRequest extends Request {
  user?: VerifiedAuthUser;
  profile?: {
    id: number;
    uid: string;
    supabaseUid: string | null;
    email: string;
    displayName: string | null;
    role: UserRole;
  };
}

export async function verifyAccessToken(token: string): Promise<VerifiedAuthUser> {
  // Prefer Supabase Auth verification when configured and token is valid
  const supabaseUser = await verifySupabaseToken(token);
  if (supabaseUser) {
    return supabaseUser;
  }

  // Fallback to existing Firebase ID token verification (preserved during transition)
  const decodedToken = await adminAuth.verifyIdToken(token);
  return {
    uid: decodedToken.uid,
    email: (decodedToken.email || '').toLowerCase(),
    name: decodedToken.name,
    provider: 'firebase',
  };
}

export async function syncUserProfile(authUser: VerifiedAuthUser) {
  const email = (authUser.email || '').toLowerCase();
  const displayName = authUser.name || email.split('@')[0] || 'User';

  // Look up strictly by authenticated provider UID (never by email matching)
  const existing =
    authUser.provider === 'supabase'
      ? await db
          .select()
          .from(profiles)
          .where(or(eq(profiles.supabaseUid, authUser.uid), eq(profiles.uid, authUser.uid)))
          .limit(1)
      : await db
          .select()
          .from(profiles)
          .where(eq(profiles.uid, authUser.uid))
          .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    // Refresh metadata only if changed; NEVER elevate or mutate role here
    if ((email && row.email !== email) || (displayName && row.displayName !== displayName)) {
      const [updated] = await db
        .update(profiles)
        .set({
          email: email || row.email,
          displayName: displayName || row.displayName,
        })
        .where(eq(profiles.id, row.id))
        .returning();
      return {
        ...updated,
        role: normalizeRole(updated.role),
      };
    }
    return {
      ...row,
      role: normalizeRole(row.role),
    };
  }

  // Public registration / first sign-in ALWAYS receives 'customer' role.
  // No email-based promotion and no first-user-wins fallback.
  const [inserted] = await db
    .insert(profiles)
    .values({
      uid: authUser.uid,
      supabaseUid: authUser.provider === 'supabase' ? authUser.uid : null,
      email,
      displayName,
      role: 'customer',
    })
    .onConflictDoUpdate({
      target: profiles.uid,
      set: {
        email,
        displayName,
      },
    })
    .returning();

  return {
    ...inserted,
    role: normalizeRole(inserted.role),
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const verifiedUser = await verifyAccessToken(token);
    req.user = verifiedUser;
    req.profile = await syncUserProfile(verifiedUser);
    next();
  } catch (error) {
    console.error('Error verifying authentication token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

// Staff operational access: Owner, Admin, or Staff
export const requireStaffOrAbove = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const role = req.profile?.role;
  if (role !== 'owner' && role !== 'admin' && role !== 'staff') {
    return res.status(403).json({ error: 'Forbidden: Staff or higher access required' });
  }
  next();
};

// Menu, analytics, customers, and website content access: Owner or Admin
export const requireAdminOrOwner = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const role = req.profile?.role;
  if (role !== 'owner' && role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Administrator or Owner access required' });
  }
  next();
};

// Sensitive restaurant settings & role management: Owner ONLY
export const requireOwner = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.profile || req.profile.role !== 'owner') {
    return res.status(403).json({ error: 'Forbidden: Owner access required' });
  }
  next();
};
