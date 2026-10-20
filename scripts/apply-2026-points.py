#!/usr/bin/env python3
"""Apply the 2026 weights verified against the two user-provided PDF books."""
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def patch_runtime(text, name):
    if '// OMR uniform score policy v1:' in text:
        return text  # The subsequent score-policy patch owns these newer formatters.
    old = "function pointsNotice(D){const p=ptsInfo(D);return hasActualPoints(D)&&p.source&&p.source.printed_notice?` · 공식 배점 ${p.source.printed_notice}`:'';}"
    new = "function pointsNotice(D){const p=ptsInfo(D);return hasActualPoints(D)&&p.source&&p.source.printed_notice?` · ${p.source.kind==='provided_prep_book'?'제공자료':'공식'} 배점 ${p.source.printed_notice}`:'';}"
    if text.count(old) == 1:
        text = text.replace(old, new)
    elif text.count(new) != 1:
        raise ValueError('Unexpected points notice in ' + name)
    if name == 'omr-v2.html':
        old = 'actual?`공식 실제 배점 · 정답 ${s.correct}/${D.nq}문항`'
        new = "actual?`${ptsInfo(D).source&&ptsInfo(D).source.kind==='provided_prep_book'?'제공자료':'공식'} 실제 배점 · 정답 ${s.correct}/${D.nq}문항`"
        if text.count(old) == 1:
            text = text.replace(old, new)
        elif text.count(new) != 1:
            raise ValueError('Unexpected student score label in ' + name)
    clean = 'function cleanScore(v){return Math.round(Number(v)*1e8)/1e8;}\r\n'
    if 'function cleanScore(' not in text:
        if text.count('function fmtScore(') != 1:
            raise ValueError('Unexpected score formatter in ' + name)
        text = text.replace('function fmtScore(', clean + 'function fmtScore(')
    elif text.count(clean) != 1:
        raise ValueError('Unexpected score normalization in ' + name)
    pairs = [
        ("return Number(v).toFixed(1).replace(/\\.0$/,'');", "return (Math.round(cleanScore(v)*10)/10).toFixed(1).replace(/\\.0$/,'');"),
        ('earned=Math.max(0,earned);', 'earned=Math.max(0,cleanScore(earned));'),
    ]
    for old, new in pairs:
        if text.count(old) == 1:
            text = text.replace(old, new)
        elif text.count(new) != 1:
            raise ValueError('Unexpected scoring runtime in ' + name)
    return text


def main():
    proof = json.loads((ROOT / 'data/verified/2026-points.json').read_text(encoding='utf-8'))
    if proof['year'] != '2026':
        raise ValueError('Unexpected proof year')
    records = {}
    for exam in proof['exams']:
        if exam['status'] == 'not_printed_in_provided_pdf':
            continue  # Missing printed weights do not justify assuming actual weights.
        if exam['status'] != 'verified' or exam['school'] in records:
            raise ValueError('Unexpected or duplicate proof entry')
        items, n = exam['items'], exam['n']
        if (len(items) != n or [q['question'] for q in exam['questions']] != list(range(1, n + 1))
                or [q['points'] for q in exam['questions']] != items
                or any(not isinstance(v, (int, float)) or isinstance(v, bool) or v <= 0 for v in items)
                or sum(Decimal(str(v)) for v in items) != Decimal(str(exam['total']))):
            raise ValueError('Incomplete or inconsistent verified points: ' + exam['school'])
        source = dict(proof['sources'][exam['source']])
        source.update(path=source['file_name'], pdf_pages=exam['pdf_pages'], verified_at=proof['verified_at'],
                      printed_notice=f"제공 해설집 문항별 배점 · {n}문항, 총 {exam['total']:g}점")
        record = dict(items=items, total=exam['total'], n=n, has=True, full=True, rate=1.0, source=source)
        if 'wrong_penalty_ratio' in exam:
            record['wrong_penalty_ratio'] = exam['wrong_penalty_ratio']
        records[exam['school']] = record
    if len(records) != 9:
        raise ValueError('Expected all nine verified 2026 exam variants')
    pending = []
    for name, marker in [('omr-v2.html', 'const ALL='), ('omr.html', 'const ALL='), ('cumulative.html', 'window.EXAMDB=')]:
        path = ROOT / name
        text = path.read_bytes().decode('utf-8')
        if text.count(marker) != 1:
            raise ValueError('Expected one embedded database in ' + name)
        start = text.index(marker) + len(marker)
        data, length = json.JSONDecoder().raw_decode(text[start:])
        questions = data['tagdb'].get('2026', {})
        if not questions and name == 'cumulative.html':
            print(name + ': no 2026 exams registered; left unchanged')
            continue
        changed = False
        for school, record in records.items():
            qs = questions.get(school, [])
            if len(qs) != record['n'] or [int(q[0]) for q in qs] != list(range(1, record['n'] + 1)):
                raise ValueError('Unexpected question alignment: ' + name + ' / ' + school)
            points = data.setdefault('points', {}).setdefault('2026', {})
            if points.get(school) != record:
                points[school] = record
                changed = True
        updated = text
        if changed:
            compact = text[start:start + 20].startswith('{"years":[')
            options = {'separators': (',', ':')} if compact else {}
            encoded = json.dumps(data, ensure_ascii=False, **options)
            updated = text[:start] + encoded + text[start + length:]
        updated = patch_runtime(updated, name)
        if updated == text:
            print(name + ': verified 2026 weights already applied')
            continue
        pending.append((path, updated.encode('utf-8')))
    # Preflight both applications before writing either; keep their original CRLF bytes.
    for path, updated in pending:
        path.write_bytes(updated)
        print(path.name + ': nine verified 2026 exam variants applied')


if __name__ == '__main__':
    main()
