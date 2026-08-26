import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
} from '@/lib/auth';

// Auth functions use jose and bcryptjs directly so we test them without mocking

describe('Auth', () => {
  describe('hashPassword', () => {
    it('returns a hashed string different from the input', async () => {
      const password = 'mysecretpassword';
      const hashed = await hashPassword(password);

      expect(hashed).not.toBe(password);
      expect(hashed).toBeTruthy();
      expect(hashed.length).toBeGreaterThan(0);
    });

    it('returns different hashes for the same password (due to salt)', async () => {
      const password = 'mysecretpassword';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('produces a bcrypt-format hash', async () => {
      const hashed = await hashPassword('test');
      // bcrypt hashes start with $2a$ or $2b$
      expect(hashed).toMatch(/^\$2[ab]\$/);
    });
  });

  describe('verifyPassword', () => {
    it('returns true for matching password and hash', async () => {
      const password = 'correctpassword';
      const hashed = await hashPassword(password);
      const result = await verifyPassword(password, hashed);

      expect(result).toBe(true);
    });

    it('returns false for non-matching password', async () => {
      const hashed = await hashPassword('correctpassword');
      const result = await verifyPassword('wrongpassword', hashed);

      expect(result).toBe(false);
    });

    it('returns false for empty password against valid hash', async () => {
      const hashed = await hashPassword('somepassword');
      const result = await verifyPassword('', hashed);

      expect(result).toBe(false);
    });
  });

  describe('createToken', () => {
    it('returns a non-empty JWT string', async () => {
      const token = await createToken('user-123', 'user@example.com', 'admin');

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      // JWT format: header.payload.signature
      expect(token.split('.')).toHaveLength(3);
    });

    it('creates different tokens for different users', async () => {
      const token1 = await createToken('user-1', 'a@example.com', 'user');
      const token2 = await createToken('user-2', 'b@example.com', 'admin');

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyToken', () => {
    it('successfully verifies a valid token', async () => {
      const token = await createToken('user-123', 'user@example.com', 'admin');
      const payload = await verifyToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe('user-123');
      expect(payload!.email).toBe('user@example.com');
      expect(payload!.role).toBe('admin');
    });

    it('returns null for an invalid token', async () => {
      const payload = await verifyToken('invalid.token.string');

      expect(payload).toBeNull();
    });

    it('returns null for an empty token', async () => {
      const payload = await verifyToken('');

      expect(payload).toBeNull();
    });

    it('returns null for a tampered token', async () => {
      const token = await createToken('user-123', 'user@example.com', 'user');
      // Tamper with the token by modifying a character
      const tampered = token.slice(0, -5) + 'XXXXX';
      const payload = await verifyToken(tampered);

      expect(payload).toBeNull();
    });

    it('preserves all payload fields through round-trip', async () => {
      const token = await createToken('usr-abc', 'test@test.com', 'user');
      const payload = await verifyToken(token);

      expect(payload).toMatchObject({
        userId: 'usr-abc',
        email: 'test@test.com',
        role: 'user',
      });
    });

    it('token contains expiration', async () => {
      const token = await createToken('user-1', 'u@e.com', 'user');
      const payload = await verifyToken(token);

      expect(payload).not.toBeNull();
      // jose's verifyToken returns payload with exp field
      // The exp should be set (7 days from now)
      expect((payload as Record<string, unknown>).exp).toBeDefined();
    });
  });

  describe('token expiry', () => {
    it('token is valid immediately after creation', async () => {
      const token = await createToken('user-1', 'u@e.com', 'user');
      const payload = await verifyToken(token);

      expect(payload).not.toBeNull();
    });

    it('token expiration is set to 7 days in the future', async () => {
      const token = await createToken('user-1', 'u@e.com', 'user');
      const payload = await verifyToken(token);

      const exp = (payload as Record<string, unknown>).exp as number;
      const iat = (payload as Record<string, unknown>).iat as number;

      // 7 days = 604800 seconds
      expect(exp - iat).toBe(604800);
    });
  });
});
