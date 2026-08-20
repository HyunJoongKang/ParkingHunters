# Cloudtype(또는 다른 컨테이너 기반 PaaS) 배포용 이미지.
# 대구시 API가 해외 IP를 차단해서, 반드시 국내 리전에서 실행되어야 한다 —
# Cloudtype 콘솔에서 이 Dockerfile을 앱 타입으로 선택하고 리전을 한국으로 설정할 것.

# ---- deps: 의존성만 먼저 설치해 레이어 캐시를 최대한 활용 ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: Next.js 빌드 ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner: standalone 산출물만 담은 최소 실행 이미지 ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
