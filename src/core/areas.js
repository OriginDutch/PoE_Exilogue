'use strict';
// Classifies internal area ids from "Generating level X area "<id>"" lines.
// Campaign ids look like "1_1_1" (act 1) ... "2_10_7" (act 10); towns end in "_town".

function classifyArea(areaId, areaLevel) {
  if (/^Hideout/i.test(areaId)) return { kind: 'hideout' };
  if (/^Map/i.test(areaId)) {
    // Classic mapping: area level 68 = T1 ... 83 = T16. 3.30 reworks the atlas, so treat tier as a hint.
    const tier = areaLevel >= 68 ? areaLevel - 67 : null;
    return { kind: 'map', tier };
  }
  const c = /^(\d+)_(\d+)_(.+)$/.exec(areaId);
  if (c) {
    const act = +c[2];
    // After Kitava (act 10) the Epilogue town is "2_11_endgame_town" (Karui Shores): a town, but not an act.
    if (act > 10) return { kind: 'town', act: null, endgame: true };
    if (/town/i.test(c[3])) return { kind: 'town', act };
    return { kind: 'campaign', act };
  }
  return { kind: 'other' };
}

module.exports = { classifyArea };
