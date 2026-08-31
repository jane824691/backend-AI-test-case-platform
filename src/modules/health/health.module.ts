import { Controller, Get, Module } from '@nestjs/common';
import { Public } from '../../common/authorization/public.decorator';

@Controller('health')
class HealthController {
  @Get()
  @Public()
  check() {
    return { data: { status: 'ok' } };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
