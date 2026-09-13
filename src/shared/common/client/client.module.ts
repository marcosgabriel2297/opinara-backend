import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { HttpClientService } from './client.service';

const DEFAULT_TIMEOUT_MS = 15000;

@Module({
  imports: [HttpModule.register({ timeout: DEFAULT_TIMEOUT_MS, maxRedirects: 0 })],
  providers: [HttpClientService],
  exports: [HttpClientService],
})
export class HttpClientModule {}
