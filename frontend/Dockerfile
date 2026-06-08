FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --include=dev

FROM deps AS build
COPY frontend frontend
ARG VITE_API_URL=http://localhost:3333/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build --workspace frontend

FROM node:22-alpine AS runtime
WORKDIR /app/frontend
COPY --from=build /app/frontend/dist dist
COPY frontend/package.json package.json
COPY frontend/scripts scripts
RUN npm install --omit=dev vite@6.0.7
EXPOSE 5173
CMD ["sh", "-c", "node scripts/write-runtime-env.mjs && npx vite preview --host 0.0.0.0 --port ${PORT:-5173}"]
