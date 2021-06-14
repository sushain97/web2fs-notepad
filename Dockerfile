FROM php:7-apache-buster
LABEL maintainer sushain@skc.name

RUN apt-get -qq update && apt-get -qq install \
    gnupg \
    git \
    unzip

ADD https://deb.nodesource.com/setup_12.x install_node_source.sh
RUN bash install_node_source.sh
RUN apt-get -qq update && apt-get -qq install nodejs
RUN npm install -g yarn

ADD https://getcomposer.org/installer install_composer.php
RUN php install_composer.php
RUN mv composer.phar /usr/local/bin/composer && \
    chmod +x /usr/local/bin/composer

WORKDIR /app

COPY yarn.lock package.json /app/
RUN yarn install

COPY .env symfony.lock composer.json composer.lock /app/
COPY bin bin
RUN composer install --no-dev --prefer-dist --optimize-autoloader --no-scripts

COPY src src
COPY webpack.config.js tsconfig.json /app/
RUN yarn build --mode production

COPY . .

RUN mkdir var && chown www-data var
RUN mkdir var/data && chown www-data var/data
VOLUME /app/var/data

RUN sed -ri -e 's!/var/www/html!/app/public!g' /etc/apache2/sites-available/*.conf
RUN sed -ri -e 's!/var/www/!/app/public!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf
