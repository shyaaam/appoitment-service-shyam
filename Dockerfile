# ---- Builder Stage ----
    FROM node:20-alpine AS builder

    # Set working directory
    WORKDIR /app
    
    # Copy all necessary files for building
    COPY package*.json ./
    COPY tsconfig.json ./
    COPY prisma ./prisma/
    COPY src ./src/
    
    # Install ALL dependencies (including devDependencies)
    RUN npm install
    
    # Generate Prisma Client (important!)
    RUN npx prisma generate
    
    # Build TypeScript code
    RUN npm run build
    
    # Remove development dependencies after build
    RUN npm prune --production
    
    
    # ---- Base Stage ----
    FROM node:20-alpine AS base
    
    # Set working directory
    WORKDIR /app
    
    # Copy production dependencies from the builder stage
    COPY --from=builder /app/node_modules ./node_modules
    
    # Copy Prisma Client from the builder stage
    COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
    COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
    
    # Copy built application code from the builder stage
    COPY --from=builder /app/dist ./dist

    # Copy Prisma schema (important for migrations and runtime Prisma operations)
    COPY --from=builder /app/prisma ./prisma

    # Apply database migrations and start the application
    CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]

    # Expose the application port
    EXPOSE 3001
