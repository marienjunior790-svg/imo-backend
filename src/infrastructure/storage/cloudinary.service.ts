import { randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { inject, injectable } from 'tsyringe';
import { env, isCloudinaryConfigured } from '../../config/env.js';
import { ValidationError } from '../../shared/errors/app.error.js';
import { PrismaService } from '../prisma/prisma.service.js';

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function publicApiBase(): string {
  const base = env.PUBLIC_API_URL
    ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');
  return base.replace(/\/$/, '');
}

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

  constructor(@inject(PrismaService) private readonly prisma: PrismaService) {}

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

    if (env.NODE_ENV === 'production') {
      return this.storeInDatabase(buffer, options);
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

  /** Production sans Cloudinary : fichier en base, servi par GET {API_PREFIX}/files/:token/:name */
  private async storeInDatabase(buffer: Buffer, options: UploadOptions): Promise<UploadResult> {
    const contentType = CONTENT_TYPES[extname(options.fileName).toLowerCase()] ?? 'application/octet-stream';
    const stored = await this.prisma.storedFile.upsert({
      where: { folder_fileName: { folder: options.folder, fileName: options.fileName } },
      create: {
        token: randomBytes(24).toString('hex'),
        folder: options.folder,
        fileName: options.fileName,
        contentType,
        data: buffer,
      },
      update: { contentType, data: buffer },
    });
    return {
      url: `${publicApiBase()}${env.API_PREFIX}/files/${stored.token}/${encodeURIComponent(stored.fileName)}`,
      publicId: `db:${options.folder}/${options.fileName}`,
    };
  }

  async uploadFile(file: Express.Multer.File, options: Omit<UploadOptions, 'fileName'> & { fileName?: string }): Promise<UploadResult> {
    if (!file?.buffer) throw new ValidationError('Fichier invalide');
    return this.uploadBuffer(file.buffer, {
      ...options,
      fileName: options.fileName ?? (isCloudinaryConfigured ? file.originalname : `${Date.now()}-${file.originalname}`),
      resourceType: file.mimetype.startsWith('image/') ? 'image' : 'raw',
    });
  }
}
