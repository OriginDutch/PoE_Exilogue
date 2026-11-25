#!/usr/bin/env python3
"""Builds src/core/div-cards.json: divination cards whose reward is a fixed amount of one currency item or another
divination card, as [card, set size, reward name, reward count].

Source: RePoE's base_items.json, current version in github.com/repoe-fork/repoe-fork.github.io (data/base_items.json).
Cards with random, corrupted, levelled or conditional rewards are left out (their value depends on the roll).
Usage: python3 tools/div-cards.py path/to/base_items.json
"""
import json, re, sys, pathlib
src = json.load(open(sys.argv[1], encoding='utf-8'))
out = []
for k, v in sorted(src.items()):
    if not k.startswith('Metadata/Items/DivinationCards/') or v.get('release_state') != 'released':
        continue
    p = v.get('properties') or {}
    d = (p.get('description') or '').strip()
    n = p.get('stack_size') or 0
    # Exactly one tagged part, nothing else: "<currencyitem>{3x Chaos Orb}" or "<divination>{The Doctor}".
    m = re.fullmatch(r'<(currencyitem|divination)>\{(?:([\d,]+)x )?([^{}<>]+)\}', d)
    if not m or n < 1:
        continue
    kind, count, name = m.group(1), int((m.group(2) or '1').replace(',', '')), m.group(3).strip()
    if kind == 'divination' and name == 'Divination Card':
        continue  # The Gambler: a random card
    out.append([v['name'], n, name, count])
dst = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'core' / 'div-cards.json'
dst.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'{len(out)} cards -> {dst}')
