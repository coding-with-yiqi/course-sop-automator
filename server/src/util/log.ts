import pino from 'pino';
import { env } from '../env.js';

export const log = pino({
  level: env.LOG_LEVEL,
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l' },
        },
});
