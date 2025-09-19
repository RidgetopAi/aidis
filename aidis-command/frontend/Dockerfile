# Multi-stage build for AIDIS Command Frontend
# Optimized React application with nginx

# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Build React application
RUN npm run build

# Stage 2: Production stage with nginx
FROM nginx:alpine AS production

# Copy built React app to nginx html directory
COPY --from=builder /app/build /usr/share/nginx/html

# Copy custom nginx configuration if it exists
COPY nginx.conf /etc/nginx/conf.d/default.conf 2>/dev/null || \
echo 'server {
    listen 80;
    server_name localhost;

    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://aidis-command-backend:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private must-revalidate auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
}' > /etc/nginx/conf.d/default.conf

# Create non-root user for nginx
RUN addgroup -g 1001 -S aidis && \
    adduser -S aidis -u 1001 && \
    chown -R aidis:aidis /usr/share/nginx/html && \
    chown -R aidis:aidis /var/cache/nginx && \
    chown -R aidis:aidis /var/log/nginx && \
    chown -R aidis:aidis /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R aidis:aidis /var/run/nginx.pid

# Switch to non-root user
USER aidis

# Expose frontend port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]