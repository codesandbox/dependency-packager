FROM node:current-alpine

WORKDIR /app
COPY package.json .
COPY yarn.lock .

RUN yarn install

ADD . .

RUN yarn build

ENV PORT=3000
EXPOSE 3000

CMD node dist/packager
