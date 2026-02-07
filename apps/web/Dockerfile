# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* /app/
RUN npm install --legacy-peer-deps

# ---- build ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
COPY . /app
RUN npm run build

# ---- runtime (standalone) ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Next.js standalone output
COPY --from=builder /app/.next/standalone /app/
COPY --from=builder /app/.next/static /app/.next/static
COPY --from=builder /app/public /app/public

EXPOSE 3000
CMD ["node", "server.js"]
