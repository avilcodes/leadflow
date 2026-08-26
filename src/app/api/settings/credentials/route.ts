import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { updateCredentialSchema } from '@/lib/validation';
import logger from '@/lib/logger';

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const credentials = await db.apiCredentials.findMany({});

    const masked = credentials.map(c => ({
      id: c.id,
      provider: c.provider,
      config: c.config,
      isActive: c.isActive,
      lastTestedAt: c.lastTestedAt,
      testStatus: c.testStatus,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      maskedKey: maskKey(c.encryptedKey as string),
      hasKey: true,
    }));

    return NextResponse.json({ success: true, data: masked });
  } catch (error) {
    logger.error('GET /api/settings/credentials failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateCredentialSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { provider, apiKey, config } = parsed.data;

    const credential = await db.apiCredentials.upsert(
      'provider',
      provider,
      {
        encryptedKey: apiKey,
        config: config || undefined,
        testStatus: 'untested',
      },
      {
        provider,
        encryptedKey: apiKey,
        config: config || undefined,
        testStatus: 'untested',
        isActive: true,
        createdById: session.userId,
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        id: credential.id,
        provider: credential.provider,
        maskedKey: maskKey(apiKey),
        testStatus: credential.testStatus,
      },
    });
  } catch (error) {
    logger.error('POST /api/settings/credentials failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
