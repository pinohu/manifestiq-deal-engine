import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export function getRedisConnection() {
  return new IORedis(redisUrl, { maxRetriesPerRequest: null });
}

let _scoreQueue: Queue | null = null;
let _alertQueue: Queue | null = null;

export function getScoreQueue() {
  if (!_scoreQueue) {
    _scoreQueue = new Queue('lead.score', {
      connection: getRedisConnection(),
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

export function getAlertQueue() {
  if (!_alertQueue) {
    _alertQueue = new Queue('lead.alert', {
      connection: getRedisConnection(),
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
