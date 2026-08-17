/**
 * Stockage : sans Cloudinary, le fallback disque local doit fonctionner
 * pour débloquer les PDF contrats (y compris en prod via ALLOW_LOCAL_UPLOADS).
 */
import { rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('CloudinaryService local fallback', () => {
  const folder = '__test_local_fallback__';
  const uploadsRoot = join(process.cwd(), 'uploads', folder);

  afterAll(() => {
    if (existsSync(uploadsRoot)) {
      rmSync(uploadsRoot, { recursive: true, force: true });
    }
  });

  it('écrit un buffer sur disque et renvoie une URL absolue /uploads', async () => {
    jest.resetModules();
    process.env.ALLOW_LOCAL_UPLOADS = 'true';
    process.env.PUBLIC_API_URL = 'https://imo-backend-test.example.com';
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    const { CloudinaryService } = await import(
      '../../src/infrastructure/storage/cloudinary.service.js'
    );
    const { isCloudinaryConfigured, isLocalUploadEnabled } = await import(
      '../../src/config/env.js'
    );

    expect(isCloudinaryConfigured).toBe(false);
    expect(isLocalUploadEnabled).toBe(true);

    const svc = new CloudinaryService();
    const buf = Buffer.from('%PDF-1.4 unit-test');
    const result = await svc.uploadBuffer(buf, {
      folder,
      fileName: 'contrat-test.pdf',
      resourceType: 'raw',
    });

    expect(result.url).toBe(
      'https://imo-backend-test.example.com/uploads/__test_local_fallback__/contrat-test.pdf',
    );
    expect(result.publicId).toContain('contrat-test.pdf');
    const onDisk = join(uploadsRoot, 'contrat-test.pdf');
    expect(existsSync(onDisk)).toBe(true);
    expect(readFileSync(onDisk).equals(buf)).toBe(true);
  });
});
