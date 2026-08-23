'use strict';

/*
  A test binds port 0 and lets the operating system pick. Where the dynamic range starts low - some
  machines answer `netsh int ipv4 show dynamicport tcp` with 1024 rather than 49152 - that pick can
  land on a port the Fetch standard tells clients to refuse, and both undici and Chrome do refuse
  it: the request fails with "bad port" without ever reaching the server that is running perfectly
  well. Binding again is the whole fix, because the next port the OS hands out is a different one.
*/

// https://fetch.spec.whatwg.org/#port-blocking
const BLOCKED = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110,
  111, 113, 115, 117, 119, 123, 135, 137, 138, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531,
  532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060,
  5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

/*
  `start` is any of the test servers: it takes its options and answers { url, close }. Every attempt
  after the first closes the one it rejected, so nothing is left listening.
*/
async function serveOnOpenPort(start, options, tries = 8) {
  for (let attempt = 1; ; attempt += 1) {
    const instance = await start(options);
    if (!BLOCKED.has(Number(new URL(instance.url).port)) || attempt >= tries) return instance;
    await instance.close();
  }
}

module.exports = { BLOCKED, serveOnOpenPort };
