import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const fullUser = await db.users.findById(session.userId);

    if (!fullUser || !fullUser.isActive) {
      return NextResponse.json(
        { success: false, error: 'User not found or deactivated' },
        { status: 401 }
      );
    }

    // Select only the fields we need
    const user = {
      id: fullUser.id,
      email: fullUser.email,
      name: fullUser.name,
      role: fullUser.role,
      isActive: fullUser.isActive,
      lastLoginAt: fullUser.lastLoginAt,
      createdAt: fullUser.createdAt,
    };

    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
