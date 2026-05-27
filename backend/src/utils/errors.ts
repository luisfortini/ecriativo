import type { NextFunction, Request, Response } from "express";

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const message =
    error instanceof AppError
      ? error.message
      : "Não foi possível concluir a operação agora. Verifique os dados e tente novamente.";

  if (!(error instanceof AppError)) {
    console.error(error);
  }

  res.status(statusCode).json({ message });
}
