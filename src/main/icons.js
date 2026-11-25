'use strict';
// Tool icons for the home tiles: the real icon of each tool, fetched from its own source on the user's PC
// and cached in %APPDATA%\Exilogue\icons. Nothing is bundled with the app.
//  - programs (Path of Exile, Path of Building): the icon inside the .exe
//  - websites: the site's own icon (largest apple-touch-icon / icon link, else /favicon.ico)
//  - Exilogue's own parts: in-game art from GGG's CDN (map of the highest tier reached, waypoint, Chronicle of Atzoatl)
// Refreshed at most every 30 days per icon. A failed fetch is retried after an hour (remembered in memory only,
// so being offline causes no disk writes) and the tile shows its monogram meanwhile.
// Remote content is treated as untrusted: size-capped while streaming, only real image bytes are kept
// (checked by signature, not by the server's Content-Type), PNG/JPEG are scaled down to 96 px.
const fs = require('fs');
const path = require('path');

const MAX_AGE = 30 * 86400e3;
const RETRY = 3600e3;
const MAX_HTML = 256 * 1024;
const MAX_IMAGE = 256 * 1024;
const MAX_CANDIDATES = 4;
const SITE_BUDGET_MS = 30000;
const ICON_PX = 96;
const GGG = p => `https://web.poecdn.com/image/${p}.png`;

const SITES = {
  filter: 'https://www.filterblade.xyz/',
  wealthy: 'https://wealthyexile.com/',
  ninja: 'https://poe.ninja/',
  trade: 'https://www.pathofexile.com/',
};
const ART = {
  campaign: GGG('Art/2DItems/Hideout/Waypoint'),
  events: GGG('Art/2DItems/Maps/TempleMap'), // Chronicle of Atzoatl
};
const MAP_FALLBACK = 'Strand';

// Image type from the first bytes. Anything else (HTML, SVG, junk) is refused.
function sniff(b) {
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47) return { type: 'image/png', ext: 'png' };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 6 && b.toString('latin1', 0, 4) === 'GIF8') return { type: 'image/gif', ext: 'gif' };
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  if (b.length >= 6 && b.readUInt16LE(0) === 0 && b.readUInt16LE(2) === 1 && b.readUInt16LE(4) > 0) return { type: 'image/x-icon', ext: 'ico' };
  return null;
}

// Same site: the page's host or a subdomain of its last two labels (www.pathofexile.com -> *.pathofexile.com).
function sameSite(u, base) {
  const root = new URL(base).hostname.split('.').slice(-2).join('.');
  return u.protocol === 'https:' && (u.hostname === root || u.hostname.endsWith('.' + root));
}

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3]) : '';
};

// <link rel="icon|apple-touch-icon" href sizes> → best candidates first (largest; apple-touch on ties),
// https and same site only, no duplicates, at most MAX_CANDIDATES, /favicon.ico always last.
function iconLinks(html, base) {
  const seen = new Set(), out = [];
  const head = html.slice(0, MAX_HTML);
  for (const m of head.matchAll(/<link\b[^<>]{0,2048}>/gi)) { // bounded: junk can't make this slow
    const tag = m[0];
    const rel = attr(tag, 'rel').toLowerCase();
    if (!/(^|\s)(icon|apple-touch-icon(-precomposed)?)(\s|$)/.test(rel)) continue;
    const href = attr(tag, 'href');
    if (!href || /\.svg(\?|$)/i.test(href)) continue;
    let u;
    try { u = new URL(href, base); } catch { continue; }
    if (!sameSite(u, base) || seen.has(u.href)) continue;
    seen.add(u.href);
    const sizes = attr(tag, 'sizes');
    const size = Math.max(0, ...sizes.split(/\s+/).map(s => parseInt(s, 10) || 0));
    const apple = rel.includes('apple-touch');
    out.push({ url: u.href, score: (size || (apple ? 180 : 16)) + (apple ? 1 : 0) });
  }
  out.sort((a, b) => b.score - a.score);
  const list = out.slice(0, MAX_CANDIDATES);
  const fav = new URL('/favicon.ico', base).href;
  if (!list.some(c => c.url === fav)) list.push({ url: fav, score: 0 });
  return list;
}

class IconStore {
  // opts: { dir, fetch, getFileIcon(path) → Promise<Buffer png>, resize(buf, px) → Buffer png | null, userAgent, onChange() }
  constructor(opts) {
    this.o = opts;
    this.dir = opts.dir;
    this.indexFile = path.join(this.dir, 'index.json');
    this.index = {};
    try {
      const raw = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [id, e] of Object.entries(raw)) {
          if (e && typeof e === 'object' && typeof e.key === 'string' && typeof e.file === 'string' && /^[a-z0-9-]{1,64}\.(png|jpg|gif|webp|ico)$/.test(e.file)) this.index[id] = e;
        }
      }
    } catch { /* none yet, or unreadable: refetched */ }
    this.failedAt = {};      // id -> time of the last failure (memory only)
    this.written = 0;        // disk bytes, for the Storage tab
    this.read = 0;
    this.rev = 0;
    this.busy = false;
    this.again = null;
    this.dirty = false;
    this.data = null;        // id -> data: URL for the renderer
  }

  // What the renderer gets: data: URLs (the pages only allow images from 'self' and data:).
  all() {
    if (this.data) return this.data;
    const out = {};
    for (const [id, e] of Object.entries(this.index)) {
      try {
        const buf = fs.readFileSync(path.join(this.dir, e.file));
        this.read += buf.length;
        const s = sniff(buf);
        if (s) out[id] = `data:${s.type};base64,${buf.toString('base64')}`;
      } catch { /* missing: refetched on the next refresh */ }
    }
    return (this.data = out);
  }

  _due(id, key) {
    if (this.failedAt[id] && Date.now() - this.failedAt[id] < RETRY) return false;
    const e = this.index[id];
    if (!e || e.key !== key) return true;
    if (!fs.existsSync(path.join(this.dir, e.file))) return true;
    return Date.now() - (e.at || 0) > MAX_AGE;
  }

  _writeAtomic(file, buf) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, file);
    this.written += buf.length;
  }

  // buf: verified image bytes. PNG/JPEG get scaled down to ICON_PX (smaller to store and to send to the page).
  _save(id, key, buf, src) {
    let img = buf, s = sniff(buf);
    if (!s) throw new Error('not an image');
    if ((s.ext === 'png' || s.ext === 'jpg') && this.o.resize) {
      let small = null;
      try { small = this.o.resize(buf, ICON_PX); } catch { /* keep original */ }
      if (small && small.length && sniff(small)) { img = small; s = sniff(small); }
    }
    if (img.length > MAX_IMAGE) throw new Error('too large');
    fs.mkdirSync(this.dir, { recursive: true });
    const file = `${id}.${s.ext}`;
    this._writeAtomic(path.join(this.dir, file), img);
    const old = this.index[id] && this.index[id].file;
    if (old && old !== file) { try { fs.unlinkSync(path.join(this.dir, old)); } catch { /* gone */ } }
    this.index[id] = { key, file, src, at: Date.now() };
    delete this.failedAt[id];
    this.dirty = true;
  }

  _fail(id) { this.failedAt[id] = Date.now(); } // an older working icon stays in use

  // Reads the body as a stream and stops as soon as it passes `max`.
  async _get(url, max) {
    const r = await this.o.fetch(url, { headers: { 'User-Agent': this.o.userAgent }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (Number(r.headers.get('content-length') || 0) > max) throw new Error('too large');
    if (!r.body || !r.body.getReader) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > max) throw new Error('too large');
      return buf;
    }
    const reader = r.body.getReader(), parts = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > max) { try { await reader.cancel(); } catch { /* closed */ } throw new Error('too large'); }
      parts.push(Buffer.from(value));
    }
    return Buffer.concat(parts);
  }

  async _image(url) {
    const buf = await this._get(url, MAX_IMAGE * 8); // before scaling down
    if (!sniff(buf)) throw new Error('not an image');
    return buf;
  }

  async _site(id, url) {
    if (!this._due(id, url)) return false;
    const deadline = Date.now() + SITE_BUDGET_MS;
    let candidates;
    try { candidates = iconLinks((await this._get(url, MAX_HTML * 4)).toString('utf8'), url); } catch { candidates = iconLinks('', url); }
    for (const c of candidates) {
      if (Date.now() > deadline) break;
      try { this._save(id, url, await this._image(c.url), c.url); return true; } catch { /* next */ }
    }
    this._fail(id);
    return false;
  }

  async _url(id, urls) {
    const key = urls[0];
    if (!this._due(id, key)) return false;
    for (const u of urls) {
      try { this._save(id, key, await this._image(u), u); return true; } catch { /* next */ }
    }
    this._fail(id);
    return false;
  }

  async _exe(id, exe) {
    if (!exe || !fs.existsSync(exe)) return false;
    let stamp = 0;
    try { stamp = fs.statSync(exe).mtimeMs; } catch { /* ignore */ }
    const key = `${exe}|${stamp}`; // a game update (new exe) refreshes the icon
    if (!this._due(id, key)) return false;
    let timer;
    try {
      const buf = await Promise.race([
        this.o.getFileIcon(exe),
        new Promise((_, no) => { timer = setTimeout(() => no(new Error('timeout')), 10000); }),
      ]);
      if (!buf || !buf.length) throw new Error('no icon');
      this._save(id, key, buf, exe);
      return true;
    } catch { this._fail(id); return false; } finally { clearTimeout(timer); }
  }

  // ctx: { poeExe, pobExe, mapName } — mapName: e.g. "Strand", the map where the highest tier was first reached.
  // A request while one is running is not lost: it runs right after.
  async refresh(ctx) {
    if (this.busy) { this.again = ctx; return; }
    this.busy = true;
    let changed = false;
    try {
      changed = (await this._exe('poe', ctx.poeExe)) || changed;
      changed = (await this._exe('pob', ctx.pobExe)) || changed;
      if (ctx.aptExe) changed = (await this._exe('apt', ctx.aptExe)) || changed;
      for (const [id, url] of Object.entries(SITES)) changed = (await this._site(id, url)) || changed;
      for (const [id, url] of Object.entries(ART)) changed = (await this._url(id, [url])) || changed;
      // Extra art the app asks for: currency and goal icons from poe.ninja, map glyphs for recent maps.
      for (const x of ctx.extra || []) {
        if (!x || !/^[a-z0-9-]{1,60}$/.test(x.id) || typeof x.url !== 'string' || !/^https:\/\/web\.poecdn\.com\//.test(x.url)) continue;
        changed = (await this._url(x.id, [x.url])) || changed;
      }
      // Map glyphs and goal art pile up as you play other maps or change goals: keep the newest 40, delete the rest.
      const extra = Object.entries(this.index).filter(([id]) => /^(map|goal)-/.test(id)).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
      const drop = extra.slice(40).map(([id]) => id);
      // Cheat-sheet icons: only those of items still in a sheet (the app passes them all as extra).
      const wanted = new Set([...(ctx.extra || []).map(x => x && x.id), ...(ctx.sheetKeep || [])]);
      // (Only once the sheet prices are known: before that the list is empty and everything would be thrown away.)
      if (ctx.sheetsKnown) for (const id of Object.keys(this.index)) if (/^cs-/.test(id) && !wanted.has(id)) drop.push(id);
      if (ctx.flipsKnown) for (const id of Object.keys(this.index)) if (/^ef-/.test(id) && id !== 'ef-mirror-shard' && !wanted.has(id)) drop.push(id);
      for (const id of drop) {
        const e = this.index[id];
        try { fs.unlinkSync(path.join(this.dir, e.file)); } catch { /* gone */ }
        delete this.index[id]; this.dirty = true; changed = true;
      }
      const map = ctx.mapName || MAP_FALLBACK;
      const urls = [GGG(`Art/2DItems/Maps/Atlas2Maps/New/${map}`)];
      if (map !== MAP_FALLBACK) urls.push(GGG(`Art/2DItems/Maps/Atlas2Maps/New/${MAP_FALLBACK}`));
      changed = (await this._url('maps', urls)) || changed;
    } finally {
      if (this.dirty) { // only after a successful save: nothing due or offline means nothing written
        try {
          fs.mkdirSync(this.dir, { recursive: true });
          this._writeAtomic(this.indexFile, Buffer.from(JSON.stringify(this.index)));
          this.dirty = false;
        } catch { /* next time */ }
      }
      this.busy = false;
    }
    if (changed) { this.data = null; this.rev++; this.o.onChange && this.o.onChange(); }
    if (this.again) { const next = this.again; this.again = null; await this.refresh(next); }
  }
}

module.exports = { IconStore, iconLinks, sniff };
