FROM mcr.microsoft.com/playwright:v1.65.0-noble

ENV NODE_ENV=production
ENV PORT=3000
ENV CRAWLEE_STORAGE_DIR=/tmp/crawlee-storage
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.mjs ./

EXPOSE 3000
CMD ["node", "server.mjs"]
