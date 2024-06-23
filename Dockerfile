FROM php:7-alpine AS php-builder
LABEL maintainer sushain@skc.name

ADD https://getcomposer.org/installer install_composer.php
RUN php install_composer.php
RUN mv composer.phar /usr/local/bin/composer && \
    chmod +x /usr/local/bin/composer

WORKDIR /app

COPY .env symfony.lock composer.json composer.lock /app/
COPY bin bin
RUN composer install --no-dev --prefer-dist --optimize-autoloader --no-scripts

FROM node:18-alpine AS js-builder

WORKDIR /app

COPY yarn.lock package.json /app/
RUN yarn install

COPY src src
COPY webpack.config.js tsconfig.json /app/
RUN yarn build --mode production

FROM php:7-apache-bullseye

WORKDIR /app

COPY --from=php-builder /app/vendor /app/vendor/
COPY --from=js-builder /app/public/assets /app/public/assets/
COPY . .

RUN mkdir var && chown www-data var
RUN mkdir var/data && chown www-data var/data
VOLUME /app/var/data

RUN sed -ri -e 's!/var/www/html!/app/public!g' /etc/apache2/sites-available/*.conf
RUN sed -ri -e 's!/var/www/!/app/public!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf
