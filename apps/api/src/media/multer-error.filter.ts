import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { MulterError } from 'multer';
import { IMAGE_TOO_LARGE } from './media.errors';

@Catch(MulterError)
export class MulterErrorFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    const status = exception.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const body =
      exception.code === 'LIMIT_FILE_SIZE'
        ? IMAGE_TOO_LARGE
        : { code: 'IMAGE_INVALID_CONTENT', message: 'Image upload is invalid' };
    response.status(status).json(body);
  }
}
