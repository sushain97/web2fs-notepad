web2fs-notepad
===============

[![CircleCI](https://circleci.com/gh/sushain97/web2fs-notepad.svg?style=svg&circle-token=42feed6af40ba8f31483d2249a20b855a3e7d776)](https://circleci.com/gh/sushain97/web2fs-notepad)

Minimal filesystem based web notepad with versioning. Data is stored directly
on the filesystem making backups easy, searching as simple as a `grep` and
limiting runtime dependencies to PHP.

Uses [Symfony][1] on the backend with [Preact][2], [TypeScript][3], and
[BlueprintJS][4] on the frontend.

[TODO: screenshot]

Installation
------------

1. Copy `.env.dist` to `.env` and edit settings.
1. Install [PHP][11] 7.1.3+.
1. Install [`yarn`][5] and [`composer`][6].
1. Run `./bin/install`.
1. Point your web server with PHP support to `/public`.

TODO: add a Dockerfile

Development
-----------

Locally, run tests and linting using `./bin/test`. [CircleCI][7] powers CI
and mirrors the test script's actions.

Autofix errors from by [Prettier][8], [TSLint][9] and [PHP_CodeSniffer][10]
using `./bin/fix`.

[1]: https://symfony.com/
[2]: https://preactjs.com/
[3]: http://typescriptlang.org/
[4]: https://blueprintjs.com/
[5]: https://yarnpkg.com/
[6]: https://getcomposer.org/
[7]: https://circleci.com/
[8]: https://prettier.io/
[9]: https://palantir.github.io/tslint/
[10]: http://pear.php.net/package/PHP_CodeSniffer
[11]: http://www.php.net/
