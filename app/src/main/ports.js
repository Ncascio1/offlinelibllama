// Find free network "ports" on this computer only (127.0.0.1).
// Kiwix and the AI each need one. We let Windows pick a free one, so there is
// never a clash with another program, and nothing is reachable from outside.
'use strict';
const net = require('net');

function findFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen({ port: 0, host }, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Find `count` different free ports.
async function findFreePorts(count, host = '127.0.0.1') {
  const ports = new Set();
  let tries = 0;
  while (ports.size < count) {
    if (++tries > count * 20) throw new Error('could not find free ports');
    ports.add(await findFreePort(host));
  }
  return [...ports];
}

module.exports = { findFreePort, findFreePorts };
