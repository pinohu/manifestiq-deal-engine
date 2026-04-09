import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

export function isQueueAvailable(): boolean {
  return !!redisUrl;
}

export function getRedisConnection() {
  if (!redisUrl) throw new Error('REDIS_URL not configured');
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    connectTimeout: 5000,
    lazyConnect: true,
  });
}

let _scoreQueue: Queue | null = null;

export function getScoreQueue() {
  if (!_scoreQueue) {
    const conn = getRedisConnection();
    _scoreQueue = new Queue('lead.score', {
      connection: conn,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return _scoreQueue;
}

let _alertQueue: Queue | null = null;

export function getAlertQueue() {
  if (!_alertQueue) {
    const conn = getRedisConnection();
    _alertQueue = new Queue('lead.alert', {
      connection: conn,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 3000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return _alertQueue;
}
