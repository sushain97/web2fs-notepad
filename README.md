web2fs-notepad
===============

Minimal filesystem based web notepad with versioning. Data is stored directly
on the filesystem making backups easy, searching as simple as a `grep` and
limiting runtime dependencies to PHP.

Uses [Symfony][1] on the backend and [Preact][2], [TypeScript][3] and
[BlueprintJS][4] on the frontend.

[TODO: screenshot]

Installation
------------

1. Install [`yarn`][5] and [`composer`][6].
1. Run `./bin/install`.
1. Point your web server with PHP support to `public`.

Development
-----------

TODO

[1]: https://symfony.com/
[2]: https://preactjs.com/
[3]: http://typescriptlang.org/
[4]: https://blueprintjs.com/
[5]: https://yarnpkg.com/
[6]: https://getcomposer.org/
