FROM node:22-alpine AS development
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
COPY docker-dev-entrypoint.sh /usr/local/bin/docker-dev-entrypoint
RUN chmod +x /usr/local/bin/docker-dev-entrypoint

EXPOSE 3003
CMD ["npm", "run", "start:dev"]

FROM development AS build
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

EXPOSE 3003
CMD ["npm", "run", "start"]
