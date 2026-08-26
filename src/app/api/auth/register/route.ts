import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { hashPassword, createToken, setSessionCookie } from '@/lib/auth';
import { registerSchema } from '@/lib/validation';
import logger from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { email, password, name } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await db.users.findByField('email', normalizedEmail);

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // First user becomes admin
    const userCount = await db.users.count();
    const role = userCount === 0 ? 'admin' : 'user';

    const passwordHash = await hashPassword(password);

    const user = await db.users.create({
      email: normalizedEmail,
      name,
      passwordHash,
      role,
      isActive: true,
      lastLoginAt: new Date(),
    });

    const token = await createToken(user.id, user.email, user.role);
    await setSessionCookie(token);

    logger.info('User registered', { userId: user.id, email: user.email, role });

    return NextResponse.json(
      {
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
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Registration failed', { error });
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', debug: message },
      { status: 500 }
    );
  }
}
