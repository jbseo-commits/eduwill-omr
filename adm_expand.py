#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""배포본의 입시결과(ADM) 커버리지를 «실측 워크북»으로 넓힌다.

왜 필요한가
-----------
`build_omr_app_v2.py:build_admissions()` 는 학교가 «공식 발표»한 입시결과
(`data/admissions/admissions.json`)만 쓴다. 영어 고사 + 학과 단위로 남는 것이
**단국대·가천대·한성대 3개교뿐**이라 나머지 학교 시험지에서는 커트라인 박스가 아예 안 뜬다.

여기서는 `data/admissions/admissions_workbook.json`(배치상담 5개년 점수 워크북 ·
23개교 6,727행 · 전부 `basis=평균`)을 **덧대어** 커버리지를 넓힌다.
결과: 시험지 기준 6/46 → 38/46.

🔴 넣지 «않는» 것 — `admissions_estimated.json`
--------------------------------------------
4,434건짜리 추정치는 **쓰지 않는다.** 2026-08-06 크로스체크에서 이미 기각됐다:
생성기가 `BASE_SCORE 75.0` + 수기 티어 + `random.uniform(-0.5, 1.0)` 이라
**실측 점수 열을 읽지 않으며**, 백테스트가 MAE 5.2점 · 편향 +4.3점 ·
**학과 순위상관 중앙값 0.11**(항공 −0.43 · 한성 −0.40)이다.
학과별 표의 존재 이유인 「어느 학과가 더 높은가」가 담겨 있지 않다는 뜻이다.
`CLAUDE.md` 7대 원칙 2항(근거 없는 합격 점수 추정 금지)에 정면으로 걸린다.

🔴 이 값이 «커트라인»이 아니라는 것
---------------------------------
워크북 자신의 경고: *"최종등록자 «평균»이다. 합격선(커트라인)이 아니며 실제 커트는
이보다 낮다."* 그래서 `basis="평균"` 을 그대로 실어 보낸다 — 앱이 이 값을 보고
**「학교 발표값은 등록자 평균이라 실제 커트라인은 이보다 낮다」**를 머리말에 띄운다.
`est` 꼬리표는 붙이지 않는다(추정치가 아니라 실측이므로).

병합 규칙
--------
1. 공식 발표(`admissions.json`)가 있는 **학교·연도**는 그쪽을 쓴다 — 최저값까지 있어 더 정확하다.
2. 나머지를 워크북으로 채운다.
3. 워크북의 한 학교·연도·계열에 `일반`·`학사` 가 섞이면 **`일반` 만** 쓴다.
   둘의 점수대가 계통적으로 달라 섞으면 상·중·하위권 줄이 왜곡된다.
   `일반` 이 아예 없으면 그때만 `학사` 로 대체한다.

사용: python adm_expand.py <대상 html> [--check]
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

SRC = Path("C:/Users/jbseo/Desktop/exam-qa/data/admissions")


def short(school: str) -> str:
    """앱의 ADM 키 규칙 — build_omr_app_v2.py 와 «같아야» 한다."""
    return school.replace("대학교", "대")


def from_official() -> dict:
    """학교 공식 발표분. build_admissions() 와 같은 규칙으로 뽑는다."""
    p = SRC / "admissions.json"
    out: dict = {}
    if not p.exists():
        return out
    for r in json.loads(p.read_text(encoding="utf-8")).get("rows", []):
        if r.get("exam_subject") != "영어" or not r.get("dept"):
            continue
        if r.get("source") == "estimated":
            continue                      # 🔴 추정치는 여기서도 버린다
        score, basis = (r["cut_min"], "최저") if r.get("cut_min") else (r.get("cut_avg"), "평균")
        if not score:
            continue
        (out.setdefault(short(r["school"]), {}).setdefault(str(r["year"]), {})
            .setdefault(r["track"], [])).append(
                {"dept": r["dept"], "score": score, "basis": basis})
    return out


def from_workbook() -> dict:
    """배치상담 5개년 점수 워크북 — 전부 최종등록자 평균(실측)."""
    p = SRC / "admissions_workbook.json"
    out: dict = {}
    if not p.exists():
        return out
    # (학교, 연도, 계열) → 편입구분 → [행]
    bucket: dict = defaultdict(lambda: defaultdict(list))
    for r in json.loads(p.read_text(encoding="utf-8")).get("rows", []):
        dept, score, field = r.get("dept"), r.get("score"), r.get("field")
        if not dept or not field or not isinstance(score, (int, float)):
            continue
        bucket[(short(r["school"]), str(r["year"]), field)][r.get("track") or "일반"].append(
            {"dept": dept, "score": float(score), "basis": "평균"})

    for (sch, year, field), tracks in bucket.items():
        # 일반 우선 · 없으면 학사 (섞지 않는다 — 점수대가 계통적으로 다르다)
        rows = tracks.get("일반") or tracks.get("학사") or next(iter(tracks.values()))
        out.setdefault(sch, {}).setdefault(year, {})[field] = rows
    return out


def build_adm() -> tuple[dict, dict]:
    off, wb = from_official(), from_workbook()
    adm = json.loads(json.dumps(wb, ensure_ascii=False))     # 깊은 복사
    for sch, years in off.items():
        for year, tracks in years.items():
            adm.setdefault(sch, {})[year] = tracks           # 공식 발표가 이긴다
    for years in adm.values():
        for tracks in years.values():
            for rows in tracks.values():
                rows.sort(key=lambda d: -d["score"])
    return adm, {"official": off, "workbook": wb}


def patch(html_path: Path, adm: dict) -> int:
    s = html_path.read_text(encoding="utf-8")
    m = re.search(r"(const ADM=)(\{.*?\})(;)", s, re.S)
    if not m:
        raise SystemExit(f"🔴 {html_path.name}: `const ADM={{…}};` 를 찾지 못했다.")
    old = json.loads(m.group(2))
    new = json.dumps(adm, ensure_ascii=False, separators=(",", ":"))
    s = s[:m.start(2)] + new + s[m.end(2):]
    html_path.write_text(s, encoding="utf-8", newline="")
    return len(old)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("사용: python adm_expand.py <대상 html> [--check]")
    target = Path(sys.argv[1])
    adm, parts = build_adm()

    nsch = len(adm)
    npair = sum(len(y) for y in adm.values())
    nrow = sum(len(r) for y in adm.values() for t in y.values() for r in t.values())
    print(f"  입시결과 병합: {nsch}개교 · {npair}개 (학교·연도) · {nrow}행")
    print(f"    · 공식 발표 {len(parts['official'])}개교 (우선) + 워크북 {len(parts['workbook'])}개교")

    if "--check" in sys.argv:
        return
    before = patch(target, adm)
    print(f"    · {target.name}: ADM {before}개교 → {nsch}개교로 교체")


if __name__ == "__main__":
    main()
