FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript (if needed)
RUN npm run build || true

# Expose port
EXPOSE 3000

CMD ["npm", "start"]
