import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const JWT_SECRET =
  process.env.JWT_SECRET || 'spmb-sman1-cihaurbeuti-internal-jwt-signing-key-2026';

export interface AuthPayload {
  type?: 'admin';
  userId: number;
  username: string;
  fullName: string;
}

export interface StudentSessionPayload {
  type: 'student';
  studentId: number;
  nisn: string;
}

export interface AuthenticatedRequest extends Request {
  adminUser?: AuthPayload;
}

export function signAdminToken(payload: AuthPayload): string {
  return jwt.sign({ ...payload, type: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
}

export function verifyAdminToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
    if (decoded.type === 'student') return null;
    if (typeof decoded.userId !== 'number') return null;
    return decoded as unknown as AuthPayload;
  } catch {
    return null;
  }
}

export function signStudentToken(studentId: number, nisn: string): string {
  const payload: StudentSessionPayload = {
    type: 'student',
    studentId,
    nisn,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
}

export function verifyStudentToken(token: string): StudentSessionPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
    if (decoded.type !== 'student') return null;
    if (typeof decoded.studentId !== 'number' || typeof decoded.nisn !== 'string') return null;
    return {
      type: 'student',
      studentId: decoded.studentId,
      nisn: decoded.nisn,
    };
  } catch {
    return null;
  }
}

export function extractBearerOrQueryToken(req: Request, queryKey = 'token'): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const qVal = req.query?.[queryKey];
  if (typeof qVal === 'string' && qVal.trim()) {
    return qVal.trim();
  }
  return '';
}

export function requireAdminAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractBearerOrQueryToken(req, 'token');

  if (!token) {
    res.status(401).json({ error: 'Sesi tidak valid. Silakan masuk kembali.' });
    return;
  }

  const payload = verifyAdminToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Sesi telah berakhir. Silakan masuk kembali.' });
    return;
  }

  req.adminUser = payload;
  next();
}
