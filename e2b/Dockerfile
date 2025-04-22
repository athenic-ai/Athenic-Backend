FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose ports
EXPOSE 4000
EXPOSE 4001

# Set environment variables
ENV NODE_ENV=production

# Run the app
CMD ["node", "dist/server.js"] 