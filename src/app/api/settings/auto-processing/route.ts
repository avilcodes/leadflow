import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import logger from '@/lib/logger';

const SETTINGS_DOC_ID = 'auto-processing';

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const settings = await db.firestore
      .collection('settings')
      .doc(SETTINGS_DOC_ID)
      .get();

    if (!settings.exists) {
      return NextResponse.json({
        success: true,
        data: { enabled: false, updatedAt: null, updatedBy: null },
      });
    }

    const data = settings.data();
    return NextResponse.json({
      success: true,
      data: {
        enabled: data?.enabled ?? false,
        updatedAt: data?.updatedAt?.toDate?.() ?? data?.updatedAt ?? null,
        updatedBy: data?.updatedBy ?? null,
      },
    });
  } catch (error) {
    logger.error('GET /api/settings/auto-processing failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { enabled } = body;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'enabled must be a boolean' },
        { status: 400 }
      );
    }

    await db.firestore
      .collection('settings')
      .doc(SETTINGS_DOC_ID)
      .set(
        {
          enabled,
          updatedAt: new Date(),
          updatedBy: session.userId,
        },
        { merge: true }
      );

    logger.info('Auto-processing setting updated', {
      enabled,
      userId: session.userId,
    });

    return NextResponse.json({
      success: true,
      data: { enabled, updatedAt: new Date() },
    });
  } catch (error) {
    logger.error('PUT /api/settings/auto-processing failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
