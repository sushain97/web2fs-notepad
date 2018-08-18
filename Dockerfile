FROM php:7-apache-stretch
LABEL maintainer sushain@skc.name

RUN apt-get -qq update && apt-get -qq install \
    gnupg \
    git

ADD https://deb.nodesource.com/setup_10.x install_node_source.sh
RUN bash install_node_source.sh
RUN apt-get -qq update && apt-get -qq install nodejs
RUN npm install -g yarn

ADD https://getcomposer.org/installer install_composer.php
RUN php install_composer.php
RUN mv composer.phar /usr/local/bin/composer && \
    chmod +x /usr/local/bin/composer

WORKDIR /src

COPY yarn.lock package.json /src/
RUN yarn install

COPY symfony.lock composer.json composer.lock /src/
COPY bin bin
RUN composer install --no-dev --prefer-dist --optimize-autoloader

COPY . .
RUN yarn build --mode production
CMD ls -la

# TODO: finish this
