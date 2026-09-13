import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { DatabaseRepository } from '@shared/repositories';
import { OAuthState } from './oauth-state.model';

@Injectable()
export class OAuthStatesRepository extends DatabaseRepository<OAuthState> {
  constructor(@InjectModel(OAuthState.name) model: Model<OAuthState>) {
    super(model);
  }

  /**
   * Consume el state de forma atomica: `findOneAndDelete` garantiza que dos callbacks
   * concurrentes con el mismo state no puedan tener exito los dos (replay).
   */
  async consume(stateHash: string): Promise<OAuthState | null> {
    return this.model.findOneAndDelete({ stateHash }).lean<OAuthState | null>().exec();
  }

  deleteForBusiness(businessUrn: string): Promise<void> {
    return this.model
      .deleteMany({ businessUrn })
      .exec()
      .then(() => undefined);
  }
}
