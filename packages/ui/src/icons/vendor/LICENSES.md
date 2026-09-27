# Vendored icon licenses

Every file in this directory, where it came from, and the terms it is used under.
Regenerate the Devicon files with `node scripts/vendor-devicons.mjs`.

## Devicon 2.17.0 — MIT

Source: https://github.com/devicons/devicon (npm `devicon@2.17.0`, fetched from
`cdn.jsdelivr.net/npm/devicon@2.17.0/icons/`). License text below. The files were
normalised by the script: brand fill colors removed and `fill="currentColor"` set
on the root, so every mark is monochrome and takes the surrounding text color.
Geometry is unchanged.

| File               | Devicon source                    | Mark belongs to                                                                            |
| ------------------ | --------------------------------- | ------------------------------------------------------------------------------------------ |
| `node.svg`         | `nodejs/nodejs-plain.svg`         | OpenJS Foundation (Node.js)                                                                |
| `python.svg`       | `python/python-plain.svg`         | Python Software Foundation                                                                 |
| `go.svg`           | `go/go-plain.svg`                 | Google LLC; the Go gopher was designed by Renee French (CC BY 4.0, attribution given here) |
| `rust.svg`         | `rust/rust-original.svg`          | Rust Foundation                                                                            |
| `ruby.svg`         | `ruby/ruby-plain.svg`             | Yukihiro Matsumoto; the Ruby logo is CC BY-SA 2.5                                          |
| `php.svg`          | `php/php-plain.svg`               | The PHP Group                                                                              |
| `java.svg`         | `java/java-plain.svg`             | Oracle                                                                                     |
| `dotnet.svg`       | `dotnetcore/dotnetcore-plain.svg` | .NET Foundation                                                                            |
| `deno.svg`         | `denojs/denojs-original.svg`      | Deno Land Inc.                                                                             |
| `bun.svg`          | `bun/bun-plain.svg`               | Oven (Bun)                                                                                 |
| `docker.svg`       | `docker/docker-plain.svg`         | Docker, Inc.                                                                               |
| `postgres.svg`     | `postgresql/postgresql-plain.svg` | PostgreSQL Global Development Group                                                        |
| `mysql.svg`        | `mysql/mysql-original.svg`        | Oracle (MySQL)                                                                             |
| `redis.svg`        | `redis/redis-plain.svg`           | Redis Ltd.                                                                                 |
| `mongodb.svg`      | `mongodb/mongodb-plain.svg`       | MongoDB, Inc.                                                                              |
| `devicon-paths.ts` | generated from the files above    | —                                                                                          |

Devicon's MIT license covers the SVG drawings. The logos themselves remain
trademarks of their owners; Lumen shows them only to identify the framework or
database a user's own service runs (nominative use), unmodified apart from color.

```
The MIT License (MIT)

Copyright (c) 2015 konpa

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Provider marks — none vendored

Oracle Cloud, AWS, Google Cloud, Microsoft Azure, Hetzner and DigitalOcean marks
are **not** vendored. Phase 1 §5 allows an official mark only after the
implementer reads the provider's current brand guideline and records its URL and
date here. That review has not been done, so `ProviderMark` renders monogram
tiles (`OC`, `AWS`, `GCP`, `AZ`, `HZ`, `DO`, `?`) drawn in Lumen's own type. No
trademark artwork ships with Lumen until an entry is added below.

| Provider | Guideline URL | Read on | Decision      |
| -------- | ------------- | ------- | ------------- |
| —        | —             | —       | monogram tile |
