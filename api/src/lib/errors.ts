export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'No autorizado') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'No tenés permisos para hacer esto') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'No encontrado') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, code, message);
