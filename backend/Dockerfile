FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --include=dev

FROM deps AS build
COPY backend backend
RUN npm run build --workspace backend

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY backend/package.json backend/package.json
RUN npm ci --omit=dev --workspace backend
COPY --from=build /app/backend/dist backend/dist
WORKDIR /app/backend
EXPOSE 3333
CMD ["node", "dist/server.js"]
