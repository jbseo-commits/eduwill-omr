#!/usr/bin/env python3
"""Preserve verified weights; otherwise use the user's equal-weight score policy."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent.parent
MARKER = '// OMR uniform score policy v1: verified weights first; otherwise proportional scoring.'


def replace_function(text, name, replacement):
    text, count = re.subn(r'(?m)^function ' + re.escape(name) + r'\([^\r\n]*', lambda _: replacement, text)
    if count != 1:
        raise ValueError('Unexpected function: ' + name)
    return text


def application(text, name):
    if MARKER in text:
        return text
    extra = '\r\n'.join([
        MARKER,
        "function uniformMax(D){const s=String(D?D.stem:CURSCHOOL);return s.startsWith('세종대학교')?200:s.startsWith('인하대학교')?70:s.startsWith('아주대학교')?50:100;}",
        'function hasUniformPoints(D){return !hasActualPoints(D)&&!!(D&&D.nq>0);}',
        'function hasScorePoints(D){return hasActualPoints(D)||hasUniformPoints(D);}',
        "function scoreBasis(D){const p=ptsInfo(D);return hasActualPoints(D)?`${p.source&&p.source.kind==='provided_prep_book'?'제공자료':'공식'} 실제 배점`:`${uniformMax(D)}점 균등 배점`;}",
    ])
    match = re.search(r'(?m)^function hasActualPoints\([^\r\n]*', text)
    if not match:
        raise ValueError('Missing verified-points predicate')
    text = text[:match.end()] + '\r\n' + extra + text[match.end():]
    replacements = {
        'scoreMax': 'function scoreMax(D){return hasActualPoints(D)?Number(ptsInfo(D).total):uniformMax(D);}',
        'pointOf': 'function pointOf(q,D){const m=ptsMap(D),v=m?m[q]:undefined;return Number.isFinite(v)?v:hasUniformPoints(D)?uniformMax(D)/D.nq:1;}',
        'fmtScore': "function fmtScore(v,D){return (Math.round(cleanScore(v)*10)/10).toFixed(1).replace(/\\.0$/,'');}",
        'scoreFraction': "function scoreFraction(v,D){return hasScorePoints(D)?`${fmtScore(v,D)}/${fmtScore(scoreMax(D),D)}점`:`${Math.round(v)}/${D.nq}문항`;}",
        'scoreText': 'function scoreText(s,D){return hasScorePoints(D)?`${scoreFraction(s.score,D)} · 정답 ${s.correct}/${D.nq}문항`:scoreFraction(s.score,D);}',
        'pointsNotice': "function pointsNotice(D){const p=ptsInfo(D);if(hasActualPoints(D))return p.source&&p.source.printed_notice?` · ${p.source.kind==='provided_prep_book'?'제공자료':'공식'} 배점 ${p.source.printed_notice}`:'';return hasUniformPoints(D)?` · 문항별 배점 미확인 · ${uniformMax(D)}점 균등 배점`:'';}",
    }
    for fn, body in replacements.items():
        text = replace_function(text, fn, body)
    text = text.replace('hasActualPoints(SCORECTX)?', 'hasScorePoints(SCORECTX)?')
    if name == 'omr-v2.html':
        text = replace_function(text, 'unitOf', "function unitOf(D){return hasScorePoints(D)?'점':'문항';}")
        text = replace_function(text, 'isP100', '')
        pairs = [
            ('const t=D.tiers||[], u=unitOf(D), p100=isP100(D),actual=hasActualPoints(D);', 'const t=D.tiers||[], u=unitOf(D), actual=hasScorePoints(D);'),
            ('const hi=actual?D.scoreMax:(p100?100:D.nq);', 'const hi=actual?D.scoreMax:D.nq;'),
            ('const dv=v=>p100?v/D.nq*100:v;', 'const dv=v=>v;'),
            ('const step=p100?20:(hi<=24?5:10), minor=step/2;', 'const step=hi===100?20:(hi<=24?5:10), minor=step/2;'),
            ("actual?`${ptsInfo(D).source&&ptsInfo(D).source.kind==='provided_prep_book'?'제공자료':'공식'} 실제 배점 · 정답 ${s.correct}/${D.nq}문항`:p100?`${D.nq}문항 균등 배점 · 정답 ${s.score}개`:`${D.nq}문항 중 ${s.pct}%`", "actual?`${scoreBasis(D)} · 정답 ${s.correct}/${D.nq}문항`:`${D.nq}문항 중 ${s.pct}%`"),
            ('if (!isP100(D)) {', 'if (hasActualPoints(D)) {'),
        ]
        for old, new in pairs:
            if text.count(old) != 1:
                raise ValueError('Unexpected score view: ' + old[:60])
            text = text.replace(old, new)
        if 'isP100(' in text or 'p100?' in text:
            raise ValueError('Old double-conversion logic remains')
    return text


def cumulative(text):
    if MARKER in text:
        return text
    start = text.index('function pointMap(')
    end = text.index('const norm', start)
    block = '''// OMR uniform score policy v1: verified weights first; otherwise proportional scoring.
function pointMap(year, stem, nq){
  if(!(nq > 0)) return null;
  const p = ((DB.points||{})[year]||{})[stem];
  const verified = !!(p && Array.isArray(p.items) && p.items.length === nq && Number.isFinite(Number(p.total)));
  const total = verified ? Number(p.total) : stem.startsWith('세종대학교') ? 200 : stem.startsWith('인하대학교') ? 70 : stem.startsWith('아주대학교') ? 50 : 100;
  const qs = (((DB.tagdb||{})[year]||{})[stem]||[]).map(q=>Number(q[0]));
  const m = Object.create(null);
  for(let i=0;i<nq;i++) m[qs.length===nq?qs[i]:i+1] = verified ? Number(p.items[i]) : total/nq;
  return {map:m, total, uniform:!verified, wrong_penalty_ratio:verified?(Number(p.wrong_penalty_ratio)||0):0,
    notice:verified?((p.source||{}).printed_notice||''):`문항별 배점 미확인 · ${total}점 균등 배점`};
}

'''.replace('\n', '\r\n')
    text = text[:start] + block + text[end:]
    text = text.replace('아니면 전 문항 1점.', '미확인 시 학교별 만점에 비례한 균등 배점.')
    old = 'if(String(a) === km[q].key){ correct++; raw += pm ? (pm.map[q]||0) : 1; }'
    new = old + '\r\n    else if(pm && pm.wrong_penalty_ratio > 0) raw -= (pm.map[q]||0) * pm.wrong_penalty_ratio;'
    if text.count(old) != 1 or text.count('return {raw, correct, answered};') != 1:
        raise ValueError('Unexpected cumulative scoring loop')
    text = text.replace(old, new).replace('return {raw, correct, answered};', 'return {raw:Math.round(Math.max(0,raw)*1e8)/1e8, correct, answered};')
    text = text.replace("' + r.raw + (s.hasPoints ? '점' : '')", "' + (Math.round(r.raw*10)/10) + (s.hasPoints ? '점' : '')")
    return text


def sync_verified_points(text, canonical):
    marker = 'window.EXAMDB='
    start = text.index(marker) + len(marker)
    data, length = json.JSONDecoder().raw_decode(text[start:])
    changed = False
    for year, schools in data['tagdb'].items():
        for school, qs in schools.items():
            p = canonical.get('points', {}).get(year, {}).get(school)
            source_qs = canonical.get('tagdb', {}).get(year, {}).get(school, [])
            if (not p or not isinstance(p.get('items'), list) or len(p['items']) != len(qs)
                    or not isinstance(p.get('total'), (int, float))
                    or [q[0] for q in qs] != [q[0] for q in source_qs]):
                continue
            points = data.setdefault('points', {}).setdefault(year, {})
            if points.get(school) != p:
                points[school] = p
                changed = True
    if not changed:
        return text
    encoded = json.dumps(data, ensure_ascii=False)
    return text[:start] + encoded + text[start + length:]


def main():
    source = (ROOT / 'omr-v2.html').read_bytes().decode('utf-8')
    canonical = json.JSONDecoder().raw_decode(source.split('const ALL=', 1)[1])[0]
    pending = []
    for name in ['omr-v2.html', 'omr.html', 'cumulative.html']:
        path = ROOT / name
        text = path.read_bytes().decode('utf-8')
        updated = cumulative(sync_verified_points(text, canonical)) if name == 'cumulative.html' else application(text, name)
        if updated != text:
            pending.append((path, updated.encode('utf-8')))
    for path, updated in pending:
        path.write_bytes(updated)
        print(path.name + ': verified weights or proportional score policy applied')
    if not pending:
        print('Score policy already applied')


if __name__ == '__main__':
    main()
