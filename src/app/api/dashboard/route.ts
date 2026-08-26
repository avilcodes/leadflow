import { NextRequest, NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import logger from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const data = await getDashboardStats();

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error('GET /api/dashboard failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
