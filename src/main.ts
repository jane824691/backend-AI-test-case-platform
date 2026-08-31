import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({ origin: frontendOrigin, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(Number(process.env.PORT ?? 3003 ));
}

void bootstrap();

