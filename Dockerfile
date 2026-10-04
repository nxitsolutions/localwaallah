# LocalWaala server: serves the app and stores each vendor's khata in PostgreSQL.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /srv/localwaallah
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY server/index.js server/
COPY app/ app/
USER node
EXPOSE 8080
CMD ["node", "server/index.js"]
