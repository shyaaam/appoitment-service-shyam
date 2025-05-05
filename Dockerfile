# ---- Builder Stage ----
    FROM node:20-alpine AS builder

    # Set working directory
    WORKDIR /app
    
    # Copy package files and install all dependencies (including devDependencies)
    COPY package*.json ./
    RUN npm install
    
    # Copy the rest of the application code
    COPY tsconfig.json ./
    COPY prisma ./prisma/
    COPY src ./src/
    
    # Generate Prisma Client
    RUN npx prisma generate
    
    # Build the TypeScript code
    RUN npm run build
    
    # ---- Production Stage ----
    FROM node:20-alpine AS production
    
    # Set working directory
    WORKDIR /app
    
    # Copy package.json for npm start command
    COPY --from=builder /app/package*.json ./
    
    # Copy only production dependencies from the builder stage
    COPY --from=builder /app/node_modules ./node_modules
    
    # Copy Prisma Client
    COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
    COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
    
    # Copy the built application code
    COPY --from=builder /app/dist ./dist
    
    # Copy Prisma schema (if migrations or runtime Prisma operations are needed)
    COPY --from=builder /app/prisma ./prisma
    
    # Expose the application port
    EXPOSE 3000
    
    # Command to run the application
    CMD ["npm", "run", "start"]
