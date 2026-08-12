# Build context: raíz del repo (necesita ver Frontend/ y Shared/ a la vez)
FROM node:20-alpine AS build
WORKDIR /app
COPY Frontend/package.json Frontend/package-lock.json* ./
RUN npm install
COPY Shared /Shared
COPY Frontend .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "./node_modules/next/dist/bin/next", "start"]
