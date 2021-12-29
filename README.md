# web2fs-notepad

[![CircleCI](https://circleci.com/gh/sushain97/web2fs-notepad.svg?style=svg&circle-token=42feed6af40ba8f31483d2249a20b855a3e7d776)](https://circleci.com/gh/sushain97/web2fs-notepad)

Minimal filesystem based web notepad with versioning, multiple formats and
sharing. Data is stored directly on the filesystem making backups easy,
searching as simple as a `grep` and limiting runtime dependencies to PHP.

Powered by [Symfony][1] on the backend with [React][2], [TypeScript][3], and
[BlueprintJS][4] on the frontend.

## Installation

These are roughly in order of increasing complexity where both the Docker
setup and the artifact download produce production builds and require
setting `APP_ENV=prod`.

### Docker

1. Install [Docker][12].
1. Download/clone source from GitHub.
1. Copy `.env.dist` to `.env` and edit settings.
1. Run `docker build -t web2fs-notepad .`
1. Run `docker run -d -p 8080:80 -v note-data:/app/var/data web2fs-notepad`
   to serve on port `8080` and use the persistent `note-data` volume.

### Artifact Download

1. Install [PHP][11] 7.4.3+.
1. Download and extract a `dist.tar.gz` from a GitHub release or CircleCI
   build.
1. Copy `.env.dist` to `.env` and edit settings.
1. Point your web server with PHP support to `/public`.

Run `./bin/update release_version|circle_build_number` to update your
deployment (CircleCI artifact download has a runtime dependency on [`jq`][14]).

### Local Build

1. Install [PHP][11] 7.4.3+.
1. Install [`yarn`][5] and [`composer`][6].
1. Download/clone source from GitHub.
1. Copy `.env.dist` to `.env` and edit settings.
1. Run `./bin/install`.
1. Point your web server with PHP support to `/public`.

If you're building for production, also run
`composer dump-autoload --optimize`.

N.B. The PHP `iconv` and `ctype` extensions are required and are installed
by default in most environments.

## Development

Use the local build instructions above to install dependencies. Then, start
the development web server using `./bin/console server:run`.

Run tests and linters using `./bin/test`. [CircleCI][7] powers CI and mirrors
the test script's actions.

Autofix errors from [Prettier][8], [ESLint][9], [Stylelint][13], and
[PHP_CodeSniffer][10] using `./bin/fix`.

[1]: https://symfony.com/
[2]: https://reactjs.org/
[3]: http://typescriptlang.org/
[4]: https://blueprintjs.com/
[5]: https://yarnpkg.com/
[6]: https://getcomposer.org/
[7]: https://circleci.com/
[8]: https://prettier.io/
[9]: https://eslint.org/
[10]: http://pear.php.net/package/PHP_CodeSniffer
[11]: http://www.php.net/
[12]: https://www.docker.com/
[13]: https://stylelint.io/
[14]: https://stedolan.github.io/jq/
