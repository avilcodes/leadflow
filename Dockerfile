FROM node:22-alpine

WORKDIR /workspace

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
