import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { redisClientProvider } from './redis-client';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [redisClientProvider],
  exports: [redisClientProvider],
})
export class RedisModule {}
