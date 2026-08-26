import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth';
import logger from '@/lib/logger';

export async function POST() {
  try {
    await clearSession();

    return NextResponse.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
