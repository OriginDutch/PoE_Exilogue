'use strict';
// Last edited Path of Building build: newest .xml in Documents\Path of Building\Builds (subfolders too).
// Reads only what the tile shows: name, class, ascendancy, level, main skill.
const fs = require('fs');
const path = require('path');

const MAX_FILES = 3000, MAX_DEPTH = 3, MAX_BYTES = 4 * 1024 * 1024;

function newestXml(dir) {
  let best = null, seen = 0;
  const walk = (d, depth) => {
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (++seen > MAX_FILES) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < MAX_DEPTH) walk(p, depth + 1); continue; }
      if (!e.isFile() || !/\.xml$/i.test(e.name)) continue;
      let st; try { st = fs.statSync(p); } catch { continue; }
      if (!best || st.mtimeMs > best.mtime) best = { file: p, mtime: st.mtimeMs, size: st.size };
    }
  };
  walk(dir, 0);
  return best;
}

const attr = (tag, name) => { const m = tag.match(new RegExp('\\s' + name + '="([^"]*)"')); return m ? m[1] : null; };
const unxml = s => s == null ? null : s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function parseBuild(xml) {
  const b = (xml.match(/<Build\b[^>]*>/) || [])[0];
  if (!b) return null;
  const out = { level: Number(attr(b, 'level')) || null, cls: unxml(attr(b, 'className')), asc: unxml(attr(b, 'ascendClassName')), skill: null, stats: {} };
  // The numbers PoB itself shows in its sidebar, saved in the build as <PlayerStat stat="…" value="…"/>.
  const WANT = ['CombinedDPS', 'TotalDPS', 'FullDPS', 'Life', 'EnergyShield', 'Mana', 'Evasion', 'Armour', 'EffectiveSpellSuppressionChance', 'SpellSuppressionChance',
    'BlockChance', 'FireResist', 'ColdResist', 'LightningResist', 'ChaosResist', 'TotalEHP'];
  for (const t of xml.match(/<PlayerStat\b[^>]*>/g) || []) {
    const k = attr(t, 'stat'), v = Number(attr(t, 'value'));
    if (WANT.includes(k) && Number.isFinite(v)) out.stats[k] = v;
  }
  if (out.asc === 'None') out.asc = null;
  const main = Number(attr(b, 'mainSocketGroup')) || 1;
  const skillsBlock = (xml.match(/<Skills\b[\s\S]*?<\/Skills>/) || [])[0] || '';
  // Newer PoB keeps skill sets: use the active one if marked, else the first.
  const sets = skillsBlock.match(/<SkillSet\b[\s\S]*?<\/SkillSet>/g);
  let scope = skillsBlock;
  if (sets && sets.length) {
    const active = attr((skillsBlock.match(/<Skills\b[^>]*>/) || [''])[0], 'activeSkillSet');
    scope = sets.find(s => attr(s.match(/<SkillSet\b[^>]*>/)[0], 'id') === active) || sets[0];
  }
  const groups = scope.match(/<Skill\b[\s\S]*?<\/Skill>/g) || [];
  const g = groups[main - 1] || groups[0];
  if (g) {
    const gems = (g.match(/<Gem\b[^>]*>/g) || []).filter(t => attr(t, 'enabled') !== 'false');
    const active = gems.find(t => !/^Support/.test(attr(t, 'skillId') || '') && !/^Support/.test(attr(t, 'gemId') || '')) || gems[0];
    if (active) out.skill = unxml(attr(active, 'nameSpec'));
  }
  return out;
}

// prev: the last result; when the newest file and its time are unchanged it is returned as is (no re-read).
function lastBuild(dir, prev) {
  const f = newestXml(dir);
  if (!f) return null;
  if (prev && prev.file === f.file && prev.mtime === f.mtime) return prev;
  let info = null;
  if (f.size <= MAX_BYTES) { try { info = parseBuild(fs.readFileSync(f.file, 'utf8')); } catch { /* unreadable */ } }
  return { name: path.basename(f.file, path.extname(f.file)), file: f.file, mtime: f.mtime, ...(info || {}) };
}

module.exports = { lastBuild, parseBuild };
