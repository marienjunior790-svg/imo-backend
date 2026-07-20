import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { injectable } from 'tsyringe';
import { env, isCloudinaryConfigured } from '../../config/env.js';
import { ValidationError } from '../../shared/errors/app.error.js';

export interface UploadResult {
  url: string;
  publicId: string;
}

export interface UploadOptions {
  folder: string;
  fileName: string;
  resourceType?: 'image' | 'raw' | 'auto';
}

@injectable()
export class CloudinaryService {
  private initialized = false;

  private ensureInit(): void {
    if (this.initialized) return;
    if (isCloudinaryConfigured) {
      cloudinary.config({
        cloud_name: env.CLOUDINARY_CLOUD_NAME,
        api_key: env.CLOUDINARY_API_KEY,
        api_secret: env.CLOUDINARY_API_SECRET,
      });
    }
    this.initialized = true;
  }

  async uploadBuffer(buffer: Buffer, options: UploadOptions): Promise<UploadResult> {
    this.ensureInit();

    if (isCloudinaryConfigured) {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: options.folder,
            public_id: options.fileName.replace(/\.[^.]+$/, ''),
            resource_type: options.resourceType ?? 'auto',
          },
          (error, result) => {
            if (error || !result) return reject(error ?? new Error('Upload Cloudinary échoué'));
            resolve({ url: result.secure_url, publicId: result.public_id });
          },
        );
        stream.end(buffer);
      });
    }

    // Fallback local — développement uniquement
    if (env.NODE_ENV === 'production') {
      throw new ValidationError(
        'Stockage Cloudinary obligatoire en production. Configurez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET.',
      );
    }

    const uploadsDir = join(process.cwd(), 'uploads', options.folder);
    await mkdir(uploadsDir, { recursive: true });
    const filePath = join(uploadsDir, options.fileName);
    await writeFile(filePath, buffer);
    const publicId = `${options.folder}/${options.fileName}`;
    return {
      url: `/uploads/${options.folder}/${options.fileName}`,
      publicId,
    };
  }

  async uploadFile(file: Express.Multer.File, options: Omit<UploadOptions, 'fileName'> & { fileName?: string }): Promise<UploadResult> {
    if (!file?.buffer) throw new ValidationError('Fichier invalide');
    return this.uploadBuffer(file.buffer, {
      ...options,
      fileName: options.fileName ?? file.originalname,
      resourceType: file.mimetype.startsWith('image/') ? 'image' : 'raw',
    });
  }
}
