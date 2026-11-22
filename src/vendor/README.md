# HEIC decoder

`heic.worker.js` is the unmodified worker string extracted from the CSP build of
heic-to 1.6.7 (libheif 1.23.7), upstream commit
`78345a3fcdb4a1d70d513fce2646aeff0127f7ba`, distribution blob
`ad8c3e1d262c6c2a416f46a08b9c2381b047d8d5`.

Source and build instructions:
https://github.com/hoppergee/heic-to/tree/78345a3fcdb4a1d70d513fce2646aeff0127f7ba

To reproduce: parse `dist/csp/heic-to.js` with TypeScript's `createSourceFile`,
find its string literal longer than 1 MB, and write the decoded `.text` verbatim.
This isolates the decoder in a worker we can terminate on success, error or timeout.
Do not edit the minified decoder. The separate worker can be replaced/rebuilt
without changing the application; no external conversion service is used.

LGPL-3.0-or-later notices and license are shipped as `public/heic-license.txt`;
GPL-3.0 is supplied as `public/heic-gpl.txt`. Preserve upstream embedded notices.

The synthetic rainbow test fixture is base64 of libheif's
`tests/data/rainbow-451x461.heic`, blob
`6691f50f39bd69871a2abe284de2ef9f5243bc66`:
https://github.com/strukturag/libheif/blob/master/tests/data/rainbow-451x461.heic
It is test data from the LGPL-3.0 libheif project, not a user photograph.
