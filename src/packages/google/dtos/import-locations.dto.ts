import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Matches } from 'class-validator';

const ACCOUNT_NAME = /^accounts\/[A-Za-z0-9_-]{1,64}$/;
const LOCATION_NAME = /^locations\/[A-Za-z0-9_-]{1,64}$/;

/**
 * Los identificadores viajan con el formato de recurso de Google y se validan con regex:
 * asi no puede colarse un path arbitrario que termine en la URL de la API.
 */
export class ImportLocationsDto {
  @IsString()
  @Matches(ACCOUNT_NAME, { message: 'accountName must have the form accounts/{accountId}' })
  accountName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @Matches(LOCATION_NAME, { each: true, message: 'locationNames must have the form locations/{locationId}' })
  locationNames!: string[];
}
