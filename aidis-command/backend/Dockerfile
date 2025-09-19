# Multi-stage build for AIDIS Command Backend
# Optimized Node.js API server

# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies for build
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Build TypeScript (if applicable)
RUN npm run build 2>/dev/null || echo "No build script found, using source directly"

# Stage 2: Production stage
FROM node:22-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S aidis && \
    adduser -S aidis -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Copy built application or source
COPY --from=builder /app/dist ./dist 2>/dev/null || \
COPY --from=builder /app/src ./src

# Copy any other necessary files
COPY --from=builder /app/*.js ./ 2>/dev/null || true

# Create directories and set permissions
RUN mkdir -p /app/logs /app/uploads && \
    chown -R aidis:aidis /app

# Switch to non-root user
USER aidis

# Expose backend port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Start the backend server
CMD ["npm", "start"]