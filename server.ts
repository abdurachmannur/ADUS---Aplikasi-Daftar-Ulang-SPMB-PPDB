import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';
import { initDatabase, UPLOADS_DIR } from './server/db.ts';
import { publicRouter } from './server/publicRoutes.ts';
import { adminRouter } from './server/adminRoutes.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

initDatabase();

async function startServer(): Promise<void> {
  const app = express();

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Serve uploaded logos, letterheads, and documents
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Health check endpoint for Docker & production monitoring
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // REST API endpoints
  app.use('/api/public', publicRouter);
  app.use('/api/admin', adminRouter);

  // Multer / API error handler
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan pada server.';
    res.status(400).json({ error: message });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const defaultAssetsDir = path.resolve(process.cwd(), 'src/assets');
    if (fs.existsSync(defaultAssetsDir)) {
      app.use('/src/assets', express.static(defaultAssetsDir));
    }
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build belum tersedia. Jalankan npm run build terlebih dahulu.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server SPMB aktif pada http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Gagal menjalankan server:', err);
  process.exit(1);
});
