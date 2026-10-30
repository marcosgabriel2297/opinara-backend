import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

import { BusinessMemberRole } from '@shared/models/enums/business';

/** Se invita como ADMIN o MEMBER: OWNER hay uno solo, quien creo el negocio. */
const INVITABLE_ROLES = [BusinessMemberRole.ADMIN, BusinessMemberRole.MEMBER] as const;

export class CreateInvitationDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsIn(INVITABLE_ROLES)
  role!: (typeof INVITABLE_ROLES)[number];
}

export class UpdateMemberDto {
  @IsIn(INVITABLE_ROLES)
  role!: (typeof INVITABLE_ROLES)[number];
}

export class InvitationTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}
