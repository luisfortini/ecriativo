import type { NextFunction, Request, Response } from "express";

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  const malformedJson = error instanceof SyntaxError
    && typeof error === "object"
    && "status" in error
    && error.status === 400;
  const statusCode = error instanceof AppError ? error.statusCode : malformedJson ? 400 : 500;
  const message =
    error instanceof AppError
      ? error.message
      : malformedJson
        ? "JSON invalido."
        : "Nao foi possivel concluir a operacao agora. Verifique os dados e tente novamente.";

  if (!(error instanceof AppError) && !malformedJson) {
    console.error(error);
  }

  res.status(statusCode).json({ message });
}
