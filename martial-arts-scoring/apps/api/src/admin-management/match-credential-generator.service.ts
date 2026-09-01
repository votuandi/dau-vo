import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';

import type { EnvironmentVariables } from '../config/environment';

const HUMAN_FRIENDLY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ACCESS_CODE_GROUP_LENGTH = 4;
const ACCESS_CODE_GROUPS = 4;

@Injectable()
export class MatchCredentialGeneratorService {
  private readonly initialPublicIdLength: number;

  constructor(
    @Inject(ConfigService)
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.initialPublicIdLength = config.getOrThrow(
      'MATCH_PUBLIC_ID_INITIAL_LENGTH',
      { infer: true },
    );
  }

  generatePublicId(length = this.initialPublicIdLength): string {
    return this.randomCharacters(length);
  }

  generateAccessCode(): string {
    return Array.from({ length: ACCESS_CODE_GROUPS }, () =>
      this.randomCharacters(ACCESS_CODE_GROUP_LENGTH),
    ).join('-');
  }

  private randomCharacters(length: number): string {
    let value = '';

    for (let index = 0; index < length; index += 1) {
      value +=
        HUMAN_FRIENDLY_ALPHABET[randomInt(HUMAN_FRIENDLY_ALPHABET.length)];
    }

    return value;
  }
}
