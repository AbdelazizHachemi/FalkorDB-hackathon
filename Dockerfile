FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

USER node
ENV HOST=0.0.0.0
ENV PORT=8787
ENV FALKOR_HOST=falkordb
ENV FALKOR_PORT=6379

EXPOSE 8787
CMD ["npm", "start"]
