import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Inject } from '@nestjs/common';
import { IMAGE_STORAGE, type ImageStorage } from './image-storage';
import { MEDIA_NOT_FOUND } from './media.errors';

@Controller('media')
export class MediaController {
  constructor(@Inject(IMAGE_STORAGE) private readonly storage: ImageStorage) {}
  @Get(':resource/:filename')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async get(
    @Param('resource') resource: string,
    @Param('filename') filename: string,
    @Res() response: Response,
  ): Promise<void> {
    const image = await this.storage.open(`${resource}/${filename}`);
    if (image === null) {
      response.status(404).json(MEDIA_NOT_FOUND);
      return;
    }
    response.setHeader('Content-Type', image.contentType);
    response.setHeader('Content-Length', image.contentLength);
    image.stream.on('error', () => {
      if (!response.headersSent) response.status(404).json(MEDIA_NOT_FOUND);
      else response.destroy();
    });
    image.stream.pipe(response);
  }
}
