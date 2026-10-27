#!/usr/bin/env python3
"""Restore Hanyang 2024 weights verified against the admissions-office PDF."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHOOL = '한양대학교_영어A형'


def main():
    proof = json.loads((ROOT / 'data/verified/hanyang-2024-points.json').read_text(encoding='utf-8'))
    items = proof['items']
    if (proof['year'] != '2024' or proof['school'] != SCHOOL or len(items) != 35
            or [q['question'] for q in proof['questions']] != list(range(1, 36))
            or [q['points'] for q in proof['questions']] != items
            or any(type(p) is not int or p not in (2, 3, 4) for p in items)
            or proof['total'] != 100 or sum(items) != 100):
        raise ValueError('Incomplete or inconsistent verified 2024 Hanyang points')
    source = dict(proof['source'])
    source['path'] = source['file_name']
    source['pdf_pages'] = sorted({q['pdf_page'] for q in proof['questions']})
    points = {'items': items, 'total': 100, 'n': 35, 'has': True, 'full': True, 'rate': 1.0, 'source': source}
    pending = []
    for name, marker in [('omr-v2.html', 'const ALL='), ('omr.html', 'const ALL='), ('cumulative.html', 'window.EXAMDB=')]:
        path = ROOT / name
        text = path.read_bytes().decode('utf-8')
        if text.count(marker) != 1:
            raise ValueError('Expected one embedded database in ' + name)
        start = text.index(marker) + len(marker)
        data, length = json.JSONDecoder().raw_decode(text[start:])
        questions = data['tagdb']['2024'][SCHOOL]
        if len(questions) != 35 or [int(q[0]) for q in questions] != list(range(1, 36)):
            raise ValueError('Unexpected Hanyang question-number alignment in ' + name)
        if data.get('points', {}).get('2024', {}).get(SCHOOL) == points:
            print(name + ': verified points already applied')
            continue
        data.setdefault('points', {}).setdefault('2024', {})[SCHOOL] = points
        compact = text[start:start + 20].startswith('{"years":[')
        options = {'separators': (',', ':')} if compact else {}
        encoded = json.dumps(data, ensure_ascii=False, **options)
        pending.append((path, (text[:start] + encoded + text[start + length:]).encode('utf-8')))
    # Validate all applications before writing; retain their original line endings.
    for path, updated in pending:
        path.write_bytes(updated)
        print(path.name + ': 35 verified weights restored (100 points)')


if __name__ == '__main__':
    main()
