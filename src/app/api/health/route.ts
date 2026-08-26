import { NextResponse } from 'next/server';

export async function GET() {
  const checks: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      hasFirebaseServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      hasFirebaseProjectId: !!process.env.FIREBASE_PROJECT_ID,
      hasFirebaseClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasFirebasePrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      hasAuthSecret: !!process.env.AUTH_SECRET,
      hasRedisUrl: !!process.env.REDIS_URL,
      hasAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
      nodeEnv: process.env.NODE_ENV,
    },
  };

  // Test Firebase connection
  try {
    const { firestore } = await import('@/lib/firebase');
    // Try a simple read to verify connection
    const testRef = firestore.collection('users');
    const snapshot = await testRef.limit(1).get();
    checks.firebase = {
      connected: true,
      usersCount: snapshot.size,
    };
  } catch (error) {
    checks.firebase = {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3) : undefined,
    };
  }

  // Test Redis connection
  try {
    if (process.env.REDIS_URL) {
      const Redis = (await import('ioredis')).default;
      const redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
        lazyConnect: true,
      });
      await redis.connect();
      await redis.ping();
      checks.redis = { connected: true };
      await redis.quit();
    } else {
      checks.redis = { connected: false, error: 'REDIS_URL not set' };
    }
  } catch (error) {
    checks.redis = {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const allOk = (checks.firebase as Record<string, unknown>)?.connected &&
    (checks.redis as Record<string, unknown>)?.connected;

  return NextResponse.json(
    { success: allOk, checks },
    { status: allOk ? 200 : 503 }
  );
}
