'use strict';
// Turns one Client.txt line into a structured event (or null).
// Line shape (PoE1):
// 2026/11/13 20:01:02 123456789 cffb0719 [INFO Client 1234] : You have entered The Twilight Strand.
// 2026/11/13 20:01:01 123456700 1186a0e0 [DEBUG Client 1234] Generating level 1 area "1_1_1" with seed 2412345

const HEAD = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2}) \d+ \S+ \[(\w+) Client \d+\] (.*)$/;

const RX = {
  generating: /^Generating level (\d+) area "([^"]+)" with seed (\d+)/,
  entered: /^: You have entered (.+)\.$/,
  levelUp: /^: (.+?) \((\w+)\) is now level (\d+)$/,
  slain: /^: (.+?) has been slain\.$/,
  // /played and /deaths output, verified against a real 3.30 log (2026-11-14):
  // ": You have played for 8 hours, 7 minutes, and 29 seconds." / ": You have died 13 times."
  played: /^: You have played (?:for )?(.+)\.$/,
  deaths: /^: You have died (\d+) times?\.$/,
  logOpen: /\*{5} LOG FILE OPENING \*{5}/,
};

function parseTime(m) {
  // Client.txt uses local time; Date() with components = local time too.
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

function parseDuration(text) {
  // "3 days, 4 hours, 12 minutes and 5 seconds" -> seconds
  let s = 0;
  const units = { day: 86400, hour: 3600, minute: 60, second: 1 };
  for (const [, n, u] of text.matchAll(/(\d+) (day|hour|minute|second)s?/g)) s += +n * units[u];
  return s;
}

function parseLine(line) {
  if (RX.logOpen.test(line)) {
    const d = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(line);
    return { type: 'logOpen', t: d ? parseTime(d) : null };
  }
  const h = HEAD.exec(line);
  if (!h) return null;
  const t = parseTime(h);
  const msg = h[8];
  let m;
  if ((m = RX.generating.exec(msg))) return { type: 'generating', t, areaLevel: +m[1], areaId: m[2], seed: m[3] };
  if ((m = RX.entered.exec(msg))) return { type: 'entered', t, zone: m[1] };
  if ((m = RX.levelUp.exec(msg))) return { type: 'levelUp', t, name: m[1], cls: m[2], level: +m[3] };
  if ((m = RX.slain.exec(msg))) return { type: 'slain', t, name: m[1] };
  if ((m = RX.deaths.exec(msg))) return { type: 'deathsCount', t, count: +m[1] };
  if ((m = RX.played.exec(msg))) {
    const seconds = parseDuration(m[1]);
    if (seconds > 0) return { type: 'played', t, seconds };
  }
  return null;
}

module.exports = { parseLine, parseDuration };
