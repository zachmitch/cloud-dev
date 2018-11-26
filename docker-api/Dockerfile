FROM node:8
WORKDIR /usr/scr/app
COPY package*.json ./
RUN npm install
COPY . .
ENV PORT=8080
EXPOSE ${PORT}
CMD ["npm", "start"]
