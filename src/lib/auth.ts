import { SignJWT, jwtVerify } from 'jose';
import { compare, hash } from 'bcryptjs';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import db from './db';

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'dev-secret-change-in-production-32chars'
);

const SESSION_COOKIE = 'leadflow-session';
const SESSION_DURATION = 60 * 60 * 24 * 7; // 7 days

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return compare(password, hashedPassword);
}

export async function createToken(userId: string, email: string, role: string): Promise<string> {
  return new SignJWT({ userId, email, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as { userId: string; email: string; role: string };
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/',
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const userData = await db.users.findById(session.userId);
  if (!userData || !userData.isActive) return null;
  return {
    id: userData.id,
    email: userData.email as string,
    name: userData.name as string,
    role: userData.role as string,
    isActive: userData.isActive as boolean,
  };
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== 'admin') {
    throw new Error('Forbidden');
  }
  return user;
}

export function getTokenFromRequest(request: NextRequest): string | null {
  // Check cookie first
  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookieToken) return cookieToken;

  // Check Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

export async function authenticateRequest(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifyToken(token);
}
