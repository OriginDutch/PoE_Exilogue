'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { lastBuild, parseBuild } = require('../src/main/pob');

const XML = `<?xml version="1.0"?><PathOfBuilding><Build level="92" className="Shadow" ascendClassName="Trickster" mainSocketGroup="2"></Build>
<Skills activeSkillSet="1"><SkillSet id="1"><Skill label="mov"><Gem nameSpec="Flame Dash" skillId="FlameDash"/></Skill>
<Skill><Gem nameSpec="Efficacy" skillId="SupportEfficacy"/><Gem nameSpec="Essence Drain" skillId="EssenceDrain"/></Skill></SkillSet></Skills></PathOfBuilding>`;

test('pob: parses class, ascendancy, level and the main skill', () => {
  assert.deepEqual(parseBuild(XML), { level: 92, cls: 'Shadow', asc: 'Trickster', skill: 'Essence Drain' });
});

test('pob: picks the newest build, also in subfolders', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pob-'));
  fs.writeFileSync(path.join(dir, 'Old.xml'), XML);
  fs.mkdirSync(path.join(dir, '3.30'));
  fs.writeFileSync(path.join(dir, '3.30', 'ED Trickster.xml'), XML);
  const t = Date.now() / 1000;
  fs.utimesSync(path.join(dir, 'Old.xml'), t - 1000, t - 1000);
  const b = lastBuild(dir);
  assert.equal(b.name, 'ED Trickster');
  assert.equal(b.skill, 'Essence Drain');
  assert.equal(lastBuild(path.join(dir, 'missing')), null);
});
