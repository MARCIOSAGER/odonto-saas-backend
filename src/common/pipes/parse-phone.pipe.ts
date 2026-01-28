import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParsePhonePipe implements PipeTransform {
  transform(value: string): string {
    if (!value) {
      throw new BadRequestException('Phone number is required');
    }

    const normalized = value.replace(/\D/g, '');

    if (normalized.length < 10 || normalized.length > 11) {
      throw new BadRequestException('Phone number must have 10 or 11 digits');
    }

    return normalized;
  }
}
