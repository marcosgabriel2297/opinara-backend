import { PublicBusiness } from '@shared/models/business';
import { BusinessMemberRole } from '@shared/models/enums/business';

/** Lo que ve el dashboard: el business mas el rol del usuario que pregunta. */
export interface BusinessWithRole extends PublicBusiness {
  role: BusinessMemberRole;
}
