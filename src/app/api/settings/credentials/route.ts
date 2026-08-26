import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
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

    const credentials = await prisma.apiCredential.findMany({
      select: {
        id: true,
        provider: true,
        encryptedKey: true,
        config: true,
        isActive: true,
        lastTestedAt: true,
        testStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const masked = credentials.map(c => ({
      ...c,
      encryptedKey: undefined,
      maskedKey: maskKey(c.encryptedKey),
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

    const credential = await prisma.apiCredential.upsert({
      where: { provider },
      update: {
        encryptedKey: apiKey,
        config: config ? (config as object) : undefined,
        testStatus: 'untested',
        updatedAt: new Date(),
      },
      create: {
        provider,
        encryptedKey: apiKey,
        config: config ? (config as object) : undefined,
        testStatus: 'untested',
        createdById: session.userId,
      },
    });

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
