FROM node:22-alpine

WORKDIR /app

COPY FrontEnd/package.json FrontEnd/package-lock.json ./
RUN npm ci

COPY FrontEnd/ ./

EXPOSE 5173
