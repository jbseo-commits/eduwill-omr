#!/usr/bin/env python3
"""Restore PDF-verified Ajou 2024 weights in the self-contained OMR applications."""
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHOOL = '아주대학교_인문계열'


def main():
    proof = json.loads((ROOT / 'data/verified/ajou-2024-points.json').read_text(encoding='utf-8'))
    items = proof['items']
    if (proof['year'] != '2024' or proof['school'] != SCHOOL or len(items) != 50
            or [q['question'] for q in proof['questions']] != list(range(1, 51))
            or [q['points'] for q in proof['questions']] != items
            or sum(Decimal(str(p)) for p in items) != Decimal('50')):
        raise ValueError('Incomplete or inconsistent verified 2024 Ajou points')
    source = dict(proof['source'])
    source['path'] = source['file_name']
    source['printed_notice'] = '문항별 0.8·1·1.1점 표기, 50문항 총 50점'
    source['pdf_pages'] = sorted({q['pdf_page'] for q in proof['questions']})
    points = {'items': items, 'total': 50, 'n': 50, 'has': True, 'full': True, 'rate': 1.0, 'source': source}
    pending = []
    for name, marker in [('omr-v2.html', 'const ALL='), ('omr.html', 'const ALL='), ('cumulative.html', 'window.EXAMDB=')]:
        path = ROOT / name
        raw = path.read_bytes()
        text = raw.decode('utf-8')
        if text.count(marker) != 1:
            raise ValueError('Expected one embedded database in ' + name)
        start = text.index(marker) + len(marker)
        data, length = json.JSONDecoder().raw_decode(text[start:])
        questions = data['tagdb']['2024'][SCHOOL]
        if len(questions) != 50 or [int(q[0]) for q in questions] != list(range(1, 51)):
            raise ValueError('Unexpected Ajou question-number alignment in ' + name)
        if data.get('points', {}).get('2024', {}).get(SCHOOL) == points:
            print(name + ': verified points already applied')
            continue
        data.setdefault('points', {}).setdefault('2024', {})[SCHOOL] = points
        compact = text[start:start + 20].startswith('{"years":[')
        options = {'separators': (',', ':')} if compact else {}
        encoded = json.dumps(data, ensure_ascii=False, **options)
        pending.append((path, (text[:start] + encoded + text[start + length:]).encode('utf-8')))
    # Check every target before writing any distribution file; preserve CRLF bytes.
    for path, updated in pending:
        path.write_bytes(updated)
        print(path.name + ': 50 verified weights restored (50 points)')


if __name__ == '__main__':
    main()
