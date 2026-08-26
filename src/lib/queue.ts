import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import logger from './logger';

let connection: IORedis | null = null;
let connectionFailed = false;

function getRedisConnection(): IORedis | null {
  if (connectionFailed) return null;

  if (!connection) {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      connection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy(times) {
          if (times > 3) {
            connectionFailed = true;
            logger.warn('Redis connection failed after retries, queue operations will be skipped');
            return null;
          }
          return Math.min(times * 200, 2000);
        },
      });

      connection.on('error', (err) => {
        logger.error('Redis connection error', { error: err.message });
      });

      connection.on('connect', () => {
        connectionFailed = false;
        logger.info('Redis connected');
      });
    } catch (error) {
      connectionFailed = true;
      logger.warn('Failed to create Redis connection', { error });
      return null;
    }
  }

  return connection;
}

const queues = new Map<string, Queue>();

function getQueue(name: string): Queue | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  if (!queues.has(name)) {
    queues.set(name, new Queue(name, { connection: conn }));
  }

  return queues.get(name)!;
}

export interface AddJobOptions {
  delay?: number;
  priority?: number;
  attempts?: number;
  backoff?: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
  jobId?: string;
}

/**
 * Add a job to a BullMQ queue. Gracefully handles Redis being unavailable
 * by logging a warning and returning null instead of throwing.
 */
export async function addJob<T extends Record<string, unknown>>(
  queueName: string,
  jobName: string,
  data: T,
  options: AddJobOptions = {}
): Promise<string | null> {
  const queue = getQueue(queueName);

  if (!queue) {
    logger.warn('Queue unavailable (Redis not connected), job not enqueued', {
      queueName,
      jobName,
      data,
    });
    return null;
  }

  try {
    const job = await queue.add(jobName, data, {
      delay: options.delay,
      priority: options.priority,
      attempts: options.attempts || 3,
      backoff: options.backoff || {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: options.removeOnComplete ?? 100,
      removeOnFail: options.removeOnFail ?? 500,
      jobId: options.jobId,
    });

    logger.info('Job added to queue', {
      queueName,
      jobName,
      jobId: job.id,
    });

    return job.id || null;
  } catch (error) {
    logger.error('Failed to add job to queue', {
      error,
      queueName,
      jobName,
    });
    return null;
  }
}

/**
 * Close all queue connections. Call during graceful shutdown.
 */
export async function closeQueues(): Promise<void> {
  for (const [name, queue] of queues.entries()) {
    try {
      await queue.close();
      logger.info('Queue closed', { name });
    } catch (error) {
      logger.error('Failed to close queue', { name, error });
    }
  }
  queues.clear();

  if (connection) {
    try {
      connection.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    connection = null;
  }
}

// Queue name constants
export const QUEUE_NAMES = {
  LEAD_IMPORT: 'lead-import',
  ENRICHMENT: 'enrichment',
  AI_ANALYSIS: 'ai-analysis',
  EMAIL_GENERATION: 'email-generation',
  CAMPAIGN_SEND: 'campaign-send',
  WEBHOOK_PROCESS: 'webhook-process',
} as const;
