import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const ALLOWED_MIMES = /\/(jpg|jpeg|png|gif|ico|svg\+xml)$/;
const ALLOWED_EXTS = /\.(jpg|jpeg|png|gif|ico|svg)$/i;

export const imageFileFilter = (
  req: any,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) => {
  const ext = extname(file.originalname).toLowerCase();
  if (!file.mimetype.match(ALLOWED_MIMES) || !ext.match(ALLOWED_EXTS)) {
    return callback(
      new BadRequestException('Only image files are allowed (jpg, png, gif, ico, svg)'),
      false,
    );
  }
  callback(null, true);
};

export const storageConfig = (folder: string) =>
  diskStorage({
    destination: join(process.cwd(), 'uploads', folder),
    filename: (req, file, callback) => {
      const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
      callback(null, uniqueName);
    },
  });
