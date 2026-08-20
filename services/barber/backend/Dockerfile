FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY package-lock.json* ./
COPY shared ./shared
COPY services/barber/backend/package.json ./services/barber/backend/package.json
COPY services/restaurant/backend/package.json ./services/restaurant/backend/package.json

RUN if [ -f package-lock.json ]; then npm ci --omit=dev --workspace=services/barber/backend --workspace=shared; else npm install --omit=dev --workspace=services/barber/backend --workspace=shared; fi

COPY services/barber/backend/src ./services/barber/backend/src

ENV NODE_ENV=production
ENV PORT=3001
ENV DATABASE_PATH=/data/appointments.db

RUN mkdir -p /data

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3001)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "services/barber/backend/src/index.js"]
