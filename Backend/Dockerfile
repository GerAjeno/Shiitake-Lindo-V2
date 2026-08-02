# Build context: raíz del repo (necesita ver Backend/ y Shared/ a la vez)
FROM node:20-alpine AS build
WORKDIR /app
COPY Backend/package.json Backend/package-lock.json* ./
RUN npm install
COPY Shared /Shared
COPY Backend .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY Backend/package.json Backend/package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY Backend/scripts ./scripts
COPY infra/postgres/migrations /infra/postgres/migrations

EXPOSE 3001
CMD ["node", "dist/index.js"]
