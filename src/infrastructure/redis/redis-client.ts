import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export type AppRedisClient = RedisClientType;

export const redisClientProvider: Provider<AppRedisClient> = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => {
    const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
    const client = createClient({
      url,
      socket: {
        connectTimeout: Number(config.get<string>('REDIS_CONNECT_TIMEOUT_MS', '5000')),
        reconnectStrategy: false,
      },
    });

    client.on('error', (error) => {
      console.error('Redis client error', error);
    });

    await client.connect();
    return client as AppRedisClient;
  },
};
