import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 3333),
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://postgres:senha@localhost:5432/criativopro",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3333",
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  openaiApiKey: process.env.OPENAI_API_KEY,
  textModel: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.4-mini",
  imageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
  openaiTimeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? 120000)
};
