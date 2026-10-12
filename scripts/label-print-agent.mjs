#!/usr/bin/env node
/*
 * Label print agent (round C, 2026-10-12): the small program a till or office
 * computer runs so Admin → Labels can print straight to a thermal label
 * printer. The admin (in the browser) posts a signed link to the stickers in
 * the printer's language (ZPL or TSPL); this fetches it from the site and
 * sends the bytes to the printer over the network, port 9100.
 *
 *   node scripts/label-print-agent.mjs                 listens on 127.0.0.1:9110
 *   PORT=9111 node scripts/label-print-agent.mjs       another port
 *   SITE=https://bakeandgrill.mv node scripts/...      only fetch from this site
 *
 * Endpoints:
 *   GET  /          {ok, agent, version}
 *   POST /print     {url, host, port?}  or  {data (base64), host, port?}
 *                   → {ok, bytes}  or  {ok: false, error}
 *
 * It listens on the loopback address only, so only this computer's browser
 * reaches it; the printer's address comes with each request (Labels →
 * Settings → Label printer, kept in the browser). No dependencies: Node 18+.
 */
import http from 'node:http';
import net from 'node:net';

const VERSION = '1.0.0';
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 9110);
const SITE = (process.env.SITE || '').replace(/\/$/, '');
const MAX_BYTES = 32 * 1024 * 1024;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '600',
};

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...cors });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) { reject(new Error('The request is too big.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function fetchStickers(url) {
  let target;
  try { target = new URL(url); } catch { throw new Error('That is not a link.'); }
  if (!/^https?:$/.test(target.protocol)) throw new Error('Only http and https links.');
  if (SITE && target.origin !== SITE) throw new Error(`This agent fetches from ${SITE} only.`);
  if (!/\/labels\/stickers\.(zpl|tspl)$/.test(target.pathname)) throw new Error('That link is not a sticker sheet for a label printer.');
  const res = await fetch(target, { redirect: 'manual' });
  if (!res.ok) throw new Error(res.status === 403 ? 'The link has expired: prepare the stickers again.' : `The site answered ${res.status}.`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0) throw new Error('The site sent nothing.');
  if (bytes.length > MAX_BYTES) throw new Error('The sheet is too big to send.');
  return bytes;
}

function sendToPrinter(bytes, host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 15000 });
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      socket.destroy();
      if (err) reject(err); else resolve();
    };
    socket.on('connect', () => {
      socket.end(bytes, () => {
        // Give the printer a moment to take the bytes before the socket closes.
        setTimeout(() => finish(), 300);
      });
    });
    socket.on('timeout', () => finish(new Error(`The printer at ${host}:${port} did not answer.`)));
    socket.on('error', (e) => finish(new Error(`Could not reach the printer at ${host}:${port} (${e.code || e.message}).`)));
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  const path = (req.url || '/').split('?')[0];
  if (req.method === 'GET' && path === '/') { json(res, 200, { ok: true, agent: 'bake-and-grill-label-print-agent', version: VERSION }); return; }
  if (req.method !== 'POST' || path !== '/print') { json(res, 404, { ok: false, error: 'Not here. POST /print with {url, host, port}.' }); return; }
  try {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const host = String(body.host || '').trim();
    const port = Number(body.port || 9100);
    if (!host) throw new Error('No printer address.');
    if (!(port > 0 && port < 65536)) throw new Error('The port is wrong.');
    const bytes = body.data ? Buffer.from(String(body.data), 'base64') : await fetchStickers(String(body.url || ''));
    if (bytes.length === 0) throw new Error('Nothing to print.');
    await sendToPrinter(bytes, host, port);
    console.log(`${new Date().toISOString()} sent ${bytes.length} bytes to ${host}:${port}`);
    json(res, 200, { ok: true, bytes: bytes.length });
  } catch (e) {
    console.error(`${new Date().toISOString()} ${e.message}`);
    json(res, 400, { ok: false, error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Bake & Grill label print agent ${VERSION} listening on http://${HOST}:${PORT}${SITE ? ` for ${SITE}` : ''}`);
  console.log('In Admin → Labels → Settings → Label printer, set the printer address, then Pack stickers → Prepare → Send to label printer.');
});
