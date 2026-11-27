FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
