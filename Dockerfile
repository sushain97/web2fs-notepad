FROM php:7-apache-stretch
LABEL maintainer sushain@skc.name

RUN apt-get -qq update && apt-get -qq install \
    gnupg \
    git \
    unzip

ADD https://deb.nodesource.com/setup_10.x install_node_source.sh
RUN bash install_node_source.sh
RUN apt-get -qq update && apt-get -qq install nodejs
RUN npm install -g yarn

ADD https://getcomposer.org/installer install_composer.php
RUN php install_composer.php
RUN mv composer.phar /usr/local/bin/composer && \
    chmod +x /usr/local/bin/composer

WORKDIR /web2fs-notepad

COPY yarn.lock package.json /web2fs-notepad/
RUN yarn install

COPY .env symfony.lock composer.json composer.lock /web2fs-notepad/
COPY bin bin
RUN composer install --no-dev --prefer-dist --optimize-autoloader --no-scripts

COPY . .
RUN yarn build --mode production

RUN mkdir var && chown www-data:www-data var

RUN sed -ri -e 's!/var/www/html!/web2fs-notepad/public!g' /etc/apache2/sites-available/*.conf
RUN sed -ri -e 's!/var/www/!/web2fs-notepad/public!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf
