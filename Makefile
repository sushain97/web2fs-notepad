all:
	composer install
	yarn install
	yarn build

test:
	yarn lint

# TODO: add linting for PHP + CI + badges
