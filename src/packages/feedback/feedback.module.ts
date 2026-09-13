import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import * as Controllers from './controllers';
import { Feedback, FeedbackRepository, FeedbackSchema } from './models';
import * as Services from './services';

@Module({
  imports: [MongooseModule.forFeature([{ name: Feedback.name, schema: FeedbackSchema }])],
  controllers: [Controllers.Feedback],
  providers: [Services.Feedback, FeedbackRepository],
  // El paquete public registra el feedback que llega de la landing anonima.
  exports: [Services.Feedback],
})
export class FeedbackModule {}
