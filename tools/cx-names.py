#!/usr/bin/env python3
"""Builds src/core/cx-names.json: GGG's internal item ids (as used by the public currency exchange history,
https://web.poecdn.com/api/currency-exchange) -> the item's name.

Source: RePoE's base_items.json, current version in github.com/repoe-fork/repoe-fork.github.io (data/base_items.json).
Usage: python3 tools/cx-names.py path/to/base_items.json
Items newer than that file have no name and simply get no exchange prices in Easyflips until the table is rebuilt.
"""
import json, sys, pathlib
PREFIXES = ('Metadata/Items/Currency/', 'Metadata/Items/DivinationCards/', 'Metadata/Items/MapFragments/',
            'Metadata/Items/Scarabs/', 'Metadata/Items/Threads/', 'Metadata/Items/Delve/', 'Metadata/Items/AtlasExiles/',
            'Metadata/Items/Heist/', 'Metadata/Items/Deepwater/')
src = json.load(open(sys.argv[1], encoding='utf-8'))
out = {k[len('Metadata/Items/'):]: v['name'] for k, v in sorted(src.items()) if k.startswith(PREFIXES) and v.get('name')}
dst = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'core' / 'cx-names.json'
dst.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'{len(out)} names -> {dst}')
