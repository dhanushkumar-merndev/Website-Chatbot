# # Stage 1: Build
# FROM node:20-alpine AS builder
# 
# # Install pnpm
# RUN npm install -g pnpm
# 
# WORKDIR /app
# 
# # Copy package files
# COPY package.json pnpm-lock.yaml ./
# 
# # Install dependencies
# RUN pnpm install --frozen-lockfile
# 
# # Copy source code and config
# COPY . .
# 
# # Build the application
# RUN pnpm run build
# 
# # Stage 2: Runner
# FROM node:20-alpine AS runner
# 
# WORKDIR /app
# 
# # Set production environment
# ENV NODE_ENV=production
# 
# # Copy only the production-ready build and necessary node_modules
# COPY --from=builder /app/dist ./dist
# COPY --from=builder /app/node_modules ./node_modules
# COPY --from=builder /app/package.json ./package.json
# 
# # Expose ports (Main app and Metrics)
# EXPOSE 4000
# EXPOSE 9464
# 
# # Start the application
# CMD ["node", "dist/main"]
