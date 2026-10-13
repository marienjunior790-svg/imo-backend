import { Router } from 'express';
import { container } from 'tsyringe';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { NotFoundError } from '../../shared/errors/app.error.js';
import { asyncHandler } from '../../shared/utils/response.util.js';

/** Fichiers stockés en base (sans Cloudinary) : accès par lien non devinable, comme une URL Cloudinary. */
const router = Router();

router.get(
  '/:token/:name',
  asyncHandler(async (req, res) => {
    const token = req.params.token;
    if (!/^[a-f0-9]{48}$/.test(token)) throw new NotFoundError('Fichier introuvable');

    const file = await container.resolve(PrismaService).storedFile.findUnique({ where: { token } });
    if (!file) throw new NotFoundError('Fichier introuvable');

    res
      .status(200)
      .setHeader('Content-Type', file.contentType)
      .setHeader('Content-Disposition', `inline; filename="${file.fileName.replace(/[^\w.\- ]/g, '_')}"`)
      .setHeader('Cache-Control', 'private, max-age=300')
      .setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      .send(Buffer.from(file.data));
  }),
);

export default router;
