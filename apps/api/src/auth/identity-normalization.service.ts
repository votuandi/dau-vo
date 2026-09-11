import { Injectable } from '@nestjs/common';

@Injectable()
export class IdentityNormalizationService {
  username(value: string): string {
    return value.trim().toLocaleLowerCase();
  }
  email(value: string): string {
    return value.trim().toLocaleLowerCase();
  }
  phone(value: string): string {
    return value.replace(/[^0-9+]/gu, '').replace(/^00/u, '+');
  }
}
