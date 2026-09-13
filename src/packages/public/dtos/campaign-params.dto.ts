import { IsString, Matches } from 'class-validator';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Los slugs se validan antes de tocar la base: son la unica entrada de un endpoint anonimo. */
export class CampaignParamsDto {
  @IsString()
  @Matches(SLUG, { message: 'invalid business slug' })
  businessSlug!: string;

  @IsString()
  @Matches(SLUG, { message: 'invalid campaign slug' })
  campaignSlug!: string;
}
