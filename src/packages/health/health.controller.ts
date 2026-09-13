import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

const CONNECTED = 1;

@Controller()
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  health() {
    return {
      status: this.connection.readyState === CONNECTED ? 'ok' : 'degraded',
      database: this.connection.readyState === CONNECTED ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
  }
}
