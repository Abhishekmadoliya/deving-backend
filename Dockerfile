# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy dependency definitions
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies needed for building)
RUN npm ci

# Copy the rest of the application code
COPY src/ ./src/

# Build the TypeScript code
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /usr/src/app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy package definitions
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy compiled JavaScript from builder
COPY --from=builder /usr/src/app/dist ./dist

# Ensure the port matches Cloud Run expectations
ENV PORT=8080
EXPOSE 8080

# Default command to run the server
# To run the worker, override the command in Cloud Run configuration to `npm run start:worker`
CMD ["npm", "start"]
