import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { authenticateRequest } from '@/lib/auth';
import { getLeadSourceProvider } from '@/providers/lead-sources';
import { getEnrichmentProvider } from '@/providers/enrichment';
import { getAIProvider } from '@/providers/ai';
import { getEmailProvider } from '@/providers/email';
import logger from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const session = await authenticateRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { provider } = await params;

    let result: { success: boolean; message: string };

    try {
      switch (provider) {
        case 'apollo':
        case 'prospeo':
        case 'deepenrich': {
          const p = getLeadSourceProvider(provider);
          result = await p.testConnection();
          break;
        }
        case 'apify': {
          const p = getEnrichmentProvider();
          result = await p.testConnection();
          break;
        }
        case 'openrouter': {
          const p = getAIProvider();
          result = await p.testConnection();
          break;
        }
        case 'brevo': {
          const p = getEmailProvider();
          result = await p.testConnection();
          break;
        }
        default:
          return NextResponse.json({ success: false, error: 'Unknown provider' }, { status: 400 });
      }
    } catch (err) {
      result = { success: false, message: err instanceof Error ? err.message : 'Connection failed' };
    }

    await db.apiCredentials.updateMany(
      { provider },
      {
        lastTestedAt: new Date(),
        testStatus: result.success ? 'connected' : 'failed',
      }
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error('POST /api/settings/credentials/[provider]/test failed', { error });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
