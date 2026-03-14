FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install exact locked dependencies
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Build TypeScript (fail loudly if it breaks)
RUN npm run build

# Expose port
EXPOSE 3000

CMD ["npm", "start"]
