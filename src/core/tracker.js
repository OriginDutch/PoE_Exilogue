'use strict';
// Event-driven state machine: Client.txt events in, league/session/campaign stats out.
// Pure (no fs, no electron) so it can be tested and replayed.

const { classifyArea } = require('./areas');

const CAMPAIGN_END_ZONES = ['Karui Shores'];

function freshState() {
  return {
    version: 1,
    lastT: null,          // timestamp of last processed event
    paused: true,         // game not running -> no time accumulates
    character: null,      // { name, cls, level }
    area: null,           // { id, zone, kind, act, tier, level, seed, enteredAt }
    session: null,        // { start, deaths, mapsDone, mapMs, startLevel, breaks, breakMs, lastBreakEnd }
    lastSession: null,    // summary of the last finished session (Home: "Previous session")
    currentMap: null,     // { areaId, zone, level, tier, seed, start, activeMs, deaths }
    deathsByZone: {},
    totals: { deaths: 0, mapsDone: 0, mapMs: 0, tiers: {} },
    campaign: { runs: [], activeRunId: null },
    played: null,         // { seconds, at, char }
    deathsReported: null, // { count, at, char }
    ownership: null,      // 'run' | 'other' | null, see _runOwnsCurrentChar
    zoneCache: {},        // zone name -> area info, for re-entries without a Generating line
    eventSeq: 0,          // number of events emitted so far (events themselves live in the database)
    chars: {},            // name -> { cls, level, lastSeen } for characters that levelled or died
    highestTier: null,
    firstMapSeen: false,
    profile: null,        // { fetchedAt, chars: [{ name, class, level, league, lastLoginTime }] } from the public profile
    lastLevelT: null,     // time of the last own level-up line
  };
}

const TAIL = 500; // recent events kept in memory (snapshot + tests); the full history lives in the database

class Tracker {
  // state: the small persisted state. opts.maps: completed maps (from the database), opts.tail: latest events.
  // Completed maps and new events are not part of `s`: they are handed out once via takePending(),
  // so saving never rewrites history that is already on disk.
  constructor(state, opts = {}) {
    const st = { ...(state || {}) };
    this.maps = opts.maps ? opts.maps.slice() : [];
    this.tail = opts.tail ? opts.tail.slice(-TAIL) : [];
    this.pending = { events: [], maps: [] };
    // Saves from before the database (state.json) carry events and maps inline: hand them out as pending.
    if (Array.isArray(st.maps)) { this.maps = st.maps; this.pending.maps = st.maps.slice(); }
    if (Array.isArray(st.events)) {
      const base = Math.max(st.eventSeq || 0, st.events.length) - st.events.length;
      const evs = st.events.map((e, i) => ({ ...e, seq: e.seq || base + i + 1 }));
      this.pending.events = evs;
      this.tail = evs.slice(-TAIL);
      st.eventSeq = base + evs.length;
    }
    delete st.maps; delete st.events;
    this.s = { ...freshState(), ...st }; // older saves miss newer fields
    this.rev = 0; // bumps on every change; lets main skip unchanged snapshots and saves
  }

  // New events and completed maps since the last call, for the database. Clears the outbox.
  takePending() {
    const p = this.pending;
    this.pending = { events: [], maps: [] };
    return p;
  }

  // ---- time ----
  _advance(t) {
    const s = this.s;
    if (t == null) return;
    if (s.lastT != null && !s.paused && t > s.lastT) {
      const d = t - s.lastT;
      const run = this._activeRun();
      if (run && this._runOwnsCurrentChar(run)) run.activeMs += d;
      if (this._inCurrentMap()) {
        s.currentMap.activeMs += d;
      }
    }
    if (s.lastT == null || t > s.lastT) s.lastT = t;
  }

  setPaused(paused, t) {
    this.rev++;
    this._advance(t);
    const s = this.s;
    if (paused && !s.paused && t != null) this._endSession(t);
    s.paused = paused;
  }

  _newSession(t) {
    const c = this.s.character;
    return { start: t, deaths: 0, mapsDone: 0, mapMs: 0, startLevel: c ? c.level : null, startChar: c ? c.name : null,
             breaks: 0, breakMs: 0, lastBreakEnd: t };
  }

  _endSession(t) {
    const s = this.s;
    if (!s.session || s.session.ended) return;
    s.session.ended = t;
    const se = s.session, c = s.character;
    const summary = {
      start: se.start, end: t, playedMs: Math.max(0, t - se.start), maps: se.mapsDone, mapMs: se.mapMs,
      avgMapMs: se.mapsDone ? Math.round(se.mapMs / se.mapsDone) : null, deaths: se.deaths,
      char: c ? c.name : null, levelFrom: se.startLevel ?? null, levelTo: c ? c.level : null,
      breaks: se.breaks || 0, breakMs: se.breakMs || 0,
    };
    s.lastSession = summary;
    this._emit('sessEnd', t, { char: this._eventChar(), summary });
  }

  // A break: idle for a while (start..end), or the player said so (manual, start = end = now).
  // Resets the "time since last break" for the take-a-break prompt.
  addBreak(start, end, kind) {
    const se = this.s.session;
    if (!se || se.ended) return;
    this.rev++;
    const ms = Math.max(0, end - start);
    se.breaks = (se.breaks || 0) + 1;
    se.breakMs = (se.breakMs || 0) + ms;
    se.lastBreakEnd = end;
    this._emit('break', start, { ms, kind, char: this._eventChar() });
  }

  // ---- event log ----
  _emit(type, t, data) {
    const ev = { seq: ++this.s.eventSeq, type, t, ...data };
    this.pending.events.push(ev);
    this.tail.push(ev);
    if (this.tail.length > TAIL) this.tail.splice(0, this.tail.length - TAIL);
  }

  _eventChar() {
    const s = this.s;
    const run = this._activeRun();
    if (run && run.char && this._runOwnsCurrentChar(run)) return run.char;
    return s.character ? s.character.name : null;
  }

  _referenceRun(excludeId) {
    return [...this.s.campaign.runs].reverse().find(r => r.finished && r.id !== excludeId) || null;
  }

  _seen(name, data, t) {
    const c = this.s.chars;
    c[name] = { ...(c[name] || {}), ...data, lastSeen: t };
  }

  // ---- helpers ----
  _inCurrentMap() {
    const s = this.s;
    return !!(s.currentMap && s.area && s.area.kind === 'map' && s.area.seed === s.currentMap.seed);
  }

  _activeRun() {
    const c = this.s.campaign;
    return c.runs.find(r => r.id === c.activeRunId && !r.finished) || null;
  }

  _runOwnsCurrentChar(run) {
    // Client.txt never says which character is logged in. `ownership` is our best guess:
    // 'run' (playing the leveling character), 'other' (an alt / endgame char), null (unknown -> assume run).
    return this.s.ownership !== 'other';
  }

  // Own character names: from the public profile when we have it, otherwise everyone counts as own
  // (the log can't tell party members apart; solo play is the common case).
  _isOwnName(name) {
    const p = this.s.profile;
    if (p && p.chars && p.chars.length) {
      if (p.chars.some(c => c.name === name)) return true;
      if (this.s.campaign.runs.some(r => r.char === name)) return true; // claimed by a run before the profile caught up
      const run = this._activeRun();
      if (run && !run.char) return true;     // brand-new character, profile not refreshed yet
      this.s.unknownName = name;             // main refreshes the profile soon
      return false;
    }
    return true;
  }

  // Picking an abandoned (unfinished) character up again resumes its run.
  _resumeIfAbandoned(name) {
    const c = this.s.campaign;
    const run = this._activeRun();
    if (run && run.char === name) return run;
    const back = c.runs.find(r => r.char === name && !r.finished && r.abandoned);
    if (!back) return run;
    if (run) run.abandoned = true;
    back.abandoned = false;
    c.activeRunId = back.id;
    this.s.ownership = 'run';
    return back;
  }

  // Public profile: who is ours, and who logged in last.
  setProfile(chars, t) {
    const s = this.s;
    this.profileFetchedAt = t; // in memory only: a check that finds nothing new changes no saved state
    if (s.profile && JSON.stringify(s.profile.chars) === JSON.stringify(chars)) return;
    this.rev++;
    s.profile = { fetchedAt: t, chars };
    const latest = chars.reduce((a, c) => (!a || (c.lastLoginTime || 0) > (a.lastLoginTime || 0) ? c : a), null);
    if (!latest || !latest.lastLoginTime) return;
    const loginT = latest.lastLoginTime * 1000;
    if (s.lastLevelT && loginT <= s.lastLevelT) return; // the log has newer evidence
    if (s.loginSeen === loginT) return;
    s.loginSeen = loginT;
    s.character = { name: latest.name, cls: latest.class, level: latest.level };
    const run = this._activeRun();
    if (run && !run.char && latest.level <= 5 && !s.campaign.runs.some(r => r.char === latest.name)) { run.char = latest.name; run.cls = latest.class; }
    if (run && run.char) s.ownership = run.char === latest.name ? 'run' : 'other';
    else if (!run) s.ownership = null;
  }

  _closeMap(t) {
    const s = this.s;
    const m = s.currentMap;
    if (!m) return;
    m.end = t;
    this.maps.push(m);
    this.pending.maps.push(m);
    s.totals.mapsDone++;
    s.totals.mapMs += m.activeMs;
    if (m.tier != null) s.totals.tiers[m.tier] = (s.totals.tiers[m.tier] || 0) + 1;
    if (s.session) { s.session.mapsDone++; s.session.mapMs += m.activeMs; }
    s.currentMap = null;
  }

  _finishRun(run, t, reason) {
    run.finished = true;
    run.finishedAt = t;
    run.finishReason = reason;
    run.splits[run.maxAct] = run.activeMs;
    this.s.campaign.activeRunId = null;
    const ref = this._referenceRun(run.id);
    this._emit('campaign', t, { char: run.char, ms: run.activeMs, reason,
      diff: ref && ref.splits[10] != null && run.splits[10] != null ? run.splits[10] - ref.splits[10] : null });
  }

  // ---- events ----
  apply(ev) {
    if (!ev) return;
    this.rev++;
    const s = this.s;
    switch (ev.type) {
      case 'logOpen': {
        // Game (re)started. The gap before this line is "game closed" time: never counted.
        if (s.session && !s.session.ended && s.lastT != null) this._endSession(s.lastT);
        s.paused = false;
        s.lastT = ev.t;
        s.session = this._newSession(ev.t);
        s.ownership = null; // character select follows: unknown until evidence
        this._emit('sessStart', ev.t, { char: s.character ? s.character.name : null, level: s.character ? s.character.level : null });
        // An open map stays open (crash + portal back must keep counting); only a new map instance closes it.
        return;
      }
      case 'generating': {
        this._advance(ev.t);
        if (!s.session) s.session = this._newSession(ev.t);
        s.paused = false;
        const cls = classifyArea(ev.areaId, ev.areaLevel);
        s.area = { id: ev.areaId, zone: null, kind: cls.kind, act: cls.act ?? null, tier: cls.tier ?? null,
                   level: ev.areaLevel, seed: ev.seed, enteredAt: ev.t };
        this._onArea(ev, cls);
        return;
      }
      case 'entered': {
        this._advance(ev.t);
        // Campaign done: after Kitava (act 10) you reach the Epilogue, whose town is Karui Shores.
        if (CAMPAIGN_END_ZONES.includes(ev.zone)) {
          const run = this._activeRun();
          if (run && this._runOwnsCurrentChar(run)) { run.maxAct = Math.max(run.maxAct, 10); this._finishRun(run, ev.t, 'epilogue'); }
        }
        s.zoneCache = s.zoneCache || {};
        if (s.area && s.area.zone == null) {
          // Fresh "Generating" line just before: this is its name.
          s.area.zone = ev.zone;
          s.zoneCache[ev.zone] = { id: s.area.id, kind: s.area.kind, act: s.area.act, tier: s.area.tier,
                                   level: s.area.level, seed: s.area.seed };
          if (s.currentMap && s.area.kind === 'map' && !s.currentMap.zone) s.currentMap.zone = ev.zone;
        } else if (!s.area || s.area.zone !== ev.zone) {
          // Re-entering an existing instance (portal back, town) logs no "Generating" line.
          const known = s.zoneCache[ev.zone];
          s.area = known ? { ...known, zone: ev.zone, enteredAt: ev.t }
                         : { id: null, zone: ev.zone, kind: 'other', act: null, tier: null, level: null, seed: null, enteredAt: ev.t };
        }
        return;
      }
      case 'levelUp': {
        this._advance(ev.t);
        if (!this._isOwnName(ev.name)) return; // party member
        s.character = { name: ev.name, cls: ev.cls, level: ev.level };
        s.lastLevelT = ev.t;
        const c = s.campaign;
        let run = this._activeRun();
        if (run && !run.char) {
          const prev = run.mergeCandidate && c.runs.find(r => r.id === run.mergeCandidate);
          if (prev && prev.char === ev.name) {
            // The "new" run was just a relog/new Strand instance of the same character: merge back.
            prev.activeMs += run.activeMs; prev.deaths += run.deaths; prev.abandoned = false;
            c.runs = c.runs.filter(r => r !== run);
            c.activeRunId = prev.id;
            run = prev;
          } else if (ev.level <= 10) {
            run.char = ev.name; run.cls = ev.cls;
          }
          delete run.mergeCandidate;
        }
        run = this._resumeIfAbandoned(ev.name);
        if (run && run.char === ev.name) { run.level = ev.level; s.ownership = 'run'; }
        this._seen(ev.name, { cls: ev.cls, level: ev.level }, ev.t);
        this._emit('level', ev.t, { char: ev.name, cls: ev.cls, level: ev.level, zone: s.area && s.area.zone });
        return;
      }
      case 'slain': {
        this._advance(ev.t);
        if (!this._isOwnName(ev.name)) return; // someone else in the party
        this._resumeIfAbandoned(ev.name);
        s.totals.deaths++;
        if (s.session) s.session.deaths++;
        const zone = (s.area && s.area.zone) || '?';
        s.deathsByZone[zone] = (s.deathsByZone[zone] || 0) + 1;
        if (this._inCurrentMap()) s.currentMap.deaths++;
        const run = this._activeRun();
        if (run && (run.char ? run.char === ev.name : this._runOwnsCurrentChar(run))) run.deaths++;
        this._seen(ev.name, {}, ev.t);
        this._emit('death', ev.t, { char: ev.name, zone, tier: this._inCurrentMap() ? s.currentMap.tier : null,
          act: s.area && s.area.act, nth: s.session ? s.session.deaths : null });
        return;
      }
      case 'played': {
        this._advance(ev.t);
        s.played = { seconds: ev.seconds, at: ev.t, char: s.character && s.character.name };
        return;
      }
      case 'deathsCount': {
        this._advance(ev.t);
        s.deathsReported = { count: ev.count, at: ev.t, char: s.character && s.character.name };
        return;
      }
    }
  }

  _onArea(ev, cls) {
    const s = this.s;
    const c = s.campaign;

    // Fresh Twilight Strand at area level 1: a new character... or a relog/new instance of the current one.
    if (ev.areaId === '1_1_1' && ev.areaLevel === 1) {
      const prev = this._activeRun();
      // Still unclaimed (no level-up yet): a relog of the same fresh character, keep it.
      const sameChar = prev && prev.maxAct === 1 && !prev.char;
      if (!sameChar) {
        if (prev) { prev.abandoned = true; c.activeRunId = null; }
        const run = { id: `run-${ev.t}`, char: null, cls: null, level: 1, startedAt: ev.t, activeMs: 0,
                      maxAct: 1, splits: {}, deaths: 0, finished: false };
        // If the first level-up turns out to be the previous act-1 character, the runs are merged again.
        if (prev && prev.maxAct === 1 && prev.char) run.mergeCandidate = prev.id;
        c.runs.push(run);
        c.activeRunId = run.id;
      }
      s.ownership = 'run';
    }

    const run = this._activeRun();
    if (run) this._judgeOwnership(run, cls, ev.areaLevel);
    if (run && this._runOwnsCurrentChar(run)) {
      if ((cls.kind === 'campaign' || cls.kind === 'town') && cls.act > run.maxAct) {
        // Entering a new act closes the previous one(s).
        for (let a = run.maxAct; a < cls.act; a++) run.splits[a] = run.activeMs;
        run.maxAct = cls.act;
        const ref = this._referenceRun(run.id);
        const prevAct = cls.act - 1;
        this._emit('act', ev.t, { char: run.char, act: cls.act, ms: run.activeMs,
          diff: ref && ref.splits[prevAct] != null ? run.splits[prevAct] - ref.splits[prevAct] : null });
      }
      // Fallback end: first map after act 10 (e.g. if Karui Shores was missed).
      if (cls.kind === 'map' && run.maxAct >= 10) this._finishRun(run, ev.t, 'firstMap');
    }

    if (cls.kind === 'map') {
      // Maps only open after Kitava: whoever is mapping has finished the campaign.
      const who = this._eventChar();
      if (who) this._seen(who, { campaignDone: true }, ev.t);
      if (s.currentMap && s.currentMap.seed === ev.seed) return; // same instance
      this._closeMap(ev.t);
      const ch = this._eventChar();
      if (!s.firstMapSeen) {
        s.firstMapSeen = true;
        this._emit('firstMap', ev.t, { char: ch, tier: cls.tier ?? null, areaId: ev.areaId });
      } else if (cls.tier != null && (s.highestTier == null || cls.tier > s.highestTier)) {
        this._emit('tier', ev.t, { char: ch, tier: cls.tier, areaId: ev.areaId });
      }
      if (cls.tier != null && (s.highestTier == null || cls.tier > s.highestTier)) s.highestTier = cls.tier;
      s.currentMap = { areaId: ev.areaId, zone: null, level: ev.areaLevel, tier: cls.tier ?? null,
                       seed: ev.seed, start: ev.t, activeMs: 0, deaths: 0, char: (s.character && s.character.name) || null };
    }
  }

  // Area-based evidence about who is playing, for when the log hasn't told us.
  _judgeOwnership(run, cls, areaLevel) {
    const s = this.s;
    if (cls.kind === 'hideout' || cls.kind === 'other') return; // no evidence
    const tooHigh = run.level && areaLevel != null && areaLevel > run.level + 15;
    if (cls.kind === 'map') { if (run.maxAct < 10) s.ownership = 'other'; return; }
    if (tooHigh) { s.ownership = 'other'; return; }
    if ((cls.kind === 'campaign' || cls.kind === 'town') && cls.act >= run.maxAct - 1) s.ownership = 'run';
  }

  // ---- read model ----
  events() { return this.tail; } // latest events only; the database has the full history

  // name -> { cls, level, league, lastSeen, campaign: 'done' | 'act N' | 'unknown', source }
  _charList() {
    const s = this.s, out = {};
    for (const [n, c] of Object.entries(s.chars)) out[n] = { cls: c.cls, level: c.level, lastSeen: c.lastSeen, campaignDone: !!c.campaignDone, source: 'log' };
    for (const c of (s.profile && s.profile.chars) || []) {
      const o = out[c.name] || (out[c.name] = { source: 'profile' });
      o.cls = o.cls || c.class; o.league = c.league;
      if (!o.level || c.level > o.level) o.level = c.level;
      if (c.lastLoginTime) o.lastLogin = c.lastLoginTime * 1000;
    }
    for (const [n, o] of Object.entries(out)) {
      const runs = s.campaign.runs.filter(r => r.char === n);
      const r = runs[runs.length - 1];
      o.campaign = (r && r.finished) || o.campaignDone ? 'done' : r ? (r.abandoned ? 'abandoned' : 'running') : 'unknown';
      o.act = r && !r.finished ? r.maxAct : null;
    }
    return out;
  }

  // Only the fields that change by the second while nothing happens in the log (timers).
  liveSnapshot(now) {
    const s = this.s;
    const live = (!s.paused && s.lastT != null && now > s.lastT) ? now - s.lastT : 0;
    const run = this._activeRun();
    const runLive = run && this._runOwnsCurrentChar(run) ? live : 0;
    const inMap = this._inCurrentMap();
    return {
      area: s.area && { ...s.area, elapsedMs: s.area.enteredAt != null ? Math.max(0, (s.paused ? s.lastT : now) - s.area.enteredAt) : 0 },
      session: s.session && { ...s.session, elapsedMs: Math.max(0, (s.paused ? s.lastT : now) - s.session.start) },
      currentMap: s.currentMap && { ...s.currentMap, activeMs: s.currentMap.activeMs + (inMap ? live : 0) },
      runId: run ? run.id : null,
      runActiveMs: run ? run.activeMs + runLive : null,
    };
  }

  snapshot(now) {
    const s = this.s;
    const live = (!s.paused && s.lastT != null && now > s.lastT) ? now - s.lastT : 0;
    const run = this._activeRun();
    const runLive = run && this._runOwnsCurrentChar(run) ? live : 0;
    const inMap = this._inCurrentMap();

    const completed = this.maps;
    const recent = completed.slice(-20);
    const avg = arr => arr.length ? arr.reduce((a, m) => a + m.activeMs, 0) / arr.length : null;

    // Reference run for split comparison: last finished run that isn't the active one.
    // With no active run, the latest finished run is compared with the one before it (never with itself).
    const lastDone = [...s.campaign.runs].reverse().find(r => r.finished) || null;
    const ref = this._referenceRun(run ? run.id : lastDone && lastDone.id);
    const fastest = completed.length ? completed.reduce((a, m) => (m.activeMs > 0 && m.activeMs < a.activeMs ? m : a), completed[0]) : null;

    return {
      paused: s.paused,
      character: s.character,
      area: s.area && { ...s.area, elapsedMs: s.area.enteredAt != null ? Math.max(0, (s.paused ? s.lastT : now) - s.area.enteredAt) : 0 },
      session: s.session && { ...s.session, elapsedMs: Math.max(0, (s.paused ? s.lastT : now) - s.session.start) },
      inMap: inMap,
      currentMap: s.currentMap && { ...s.currentMap, activeMs: s.currentMap.activeMs + (inMap ? live : 0) },
      lastMap: completed[completed.length - 1] || null,
      avgMapMs: avg(completed),
      avgMapMsRecent: avg(recent),
      totals: s.totals,
      deathsByZone: s.deathsByZone,
      campaign: run ? {
        ...run, activeMs: run.activeMs + runLive,
        reference: ref && { char: ref.char, splits: ref.splits, activeMs: ref.activeMs },
      } : null,
      runs: s.campaign.runs.map(r => (run && r.id === run.id ? { ...r, activeMs: r.activeMs + runLive } : r)),
      lastFinishedRun: lastDone,
      referenceRun: ref && { char: ref.char, cls: ref.cls, splits: ref.splits, activeMs: ref.activeMs },
      chars: this._charList(),
      profile: s.profile && { fetchedAt: this.profileFetchedAt || s.profile.fetchedAt, count: s.profile.chars.length },
      highestTier: s.highestTier,
      fastestMap: fastest,
      eventCount: s.eventSeq || 0,
      eventSeq: s.eventSeq || 0,
      latestEvents: this.tail.slice(-5),
      played: s.played,
      lastSession: s.lastSession,
      deathsReported: s.deathsReported,
      recentMaps: completed.slice(-15).reverse(),
    };
  }
}

module.exports = { Tracker, freshState };
