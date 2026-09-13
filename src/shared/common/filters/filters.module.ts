import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AllExceptionsFilter } from './all.exception.filter';

@Module({
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class FiltersModule {}
