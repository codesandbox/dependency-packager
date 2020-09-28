FROM node:current-alpine

RUN apk add git

WORKDIR /app
COPY package.json .
COPY yarn.lock .

RUN yarn install

ADD . .

RUN yarn build

ENV PORT=3000
EXPOSE 3000

CMD node dist/packager
