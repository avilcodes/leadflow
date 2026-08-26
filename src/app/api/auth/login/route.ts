import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyPassword, createToken, setSessionCookie } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import logger from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;

    const user = await db.users.findByField('email', email.toLowerCase().trim());

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { success: false, error: 'Account is deactivated' },
        { status: 403 }
      );
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const token = await createToken(user.id, user.email, user.role);
    await setSessionCookie(token);

    await db.users.update(user.id, { lastLoginAt: new Date() });

    logger.info('User logged in', { userId: user.id, email: user.email });

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    logger.error('Login failed', { error });
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', debug: message },
      { status: 500 }
    );
  }
}
