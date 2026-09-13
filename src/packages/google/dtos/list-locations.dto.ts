import { IsString, Matches } from 'class-validator';

export class ListLocationsQueryDto {
  @IsString()
  @Matches(/^accounts\/[A-Za-z0-9_-]{1,64}$/, { message: 'accountName must have the form accounts/{accountId}' })
  accountName!: string;
}
