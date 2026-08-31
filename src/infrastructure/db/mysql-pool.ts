import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPool, Pool } from 'mysql2/promise';

export const MYSQL_POOL = Symbol('MYSQL_POOL');

export const mysqlPoolProvider: Provider<Pool> = {
  provide: MYSQL_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    createPool({
      host: config.get<string>('DB_HOST', '127.0.0.1'),
      port: config.get<number>('DB_PORT', 3306),
      user: config.get<string>('DB_USER', 'root'),
      password: config.get<string>('DB_PASSWORD', ''),
      database: config.get<string>('DB_NAME', 'ai_test_case_platform'),
      waitForConnections: true,
      connectionLimit: config.get<number>('DB_CONNECTION_LIMIT', 10),
      namedPlaceholders: true,
      timezone: '+08:00',
      supportBigNumbers: true,
      bigNumberStrings: false,
    }),
};
