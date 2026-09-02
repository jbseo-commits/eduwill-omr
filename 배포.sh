#!/usr/bin/env bash
# 편입영어 OMR 진단기 — GitHub Pages 배포 스크립트
#
# 하는 일: 원본(app/) 과 배포본이 «바이트 동일»한지, 개인정보·외부요청이 없는지
#          실측한 뒤 통과할 때만 커밋·푸시한다.
# 검사를 건너뛰려면: ./배포.sh --force   (테스트 배포용)

set -u
SRC_REPO="/c/Users/jbseo/Desktop/exam-qa"
DIST="$(cd "$(dirname "$0")" && pwd)"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

# 배포본 ← 원본 대응표
declare -A MAP=(
  ["omr.html"]="$SRC_REPO/app/OMR진단기.html"
  ["omr-v2.html"]="$SRC_REPO/app/OMR진단기_v2.html"
)

echo "== 1. 원본 확인 =="
for f in "${!MAP[@]}"; do
  if [ ! -f "${MAP[$f]}" ]; then
    echo "  🔴 원본이 없다: ${MAP[$f]}"
    exit 1
  fi
done
echo "  ✅ 원본 ${#MAP[@]}개 존재."

echo
echo "== 2. 복사 · 바이트 동일성 =="
for f in "${!MAP[@]}"; do
  cp "${MAP[$f]}" "$DIST/$f" || exit 1
  a=$(sha256sum "${MAP[$f]}" | cut -d' ' -f1)
  b=$(sha256sum "$DIST/$f"   | cut -d' ' -f1)
  if [ "$a" != "$b" ]; then echo "  🔴 $f 복사본이 원본과 다르다."; exit 1; fi
  printf "  %-14s %12s bytes · sha256 %s ✅\n" "$f" "$(stat -c%s "$DIST/$f")" "${b:0:16}"
done

echo
echo "== 3. 입시결과 커버리지 확인 =="
# 📌 2026-09-02 에 «사후 패치»에서 «확인»으로 바뀌었다 — 빌더(build_omr_app_v2.py:build_admissions)가
#    이제 admissions_workbook.json 을 직접 읽는다. 락이 풀려 원본을 고칠 수 있게 됐기 때문이다.
#    산출물은 종전 adm_expand.py 결과와 «키 순서까지 동일»함을 대조해 확인했다(24개교·112쌍·4,000행).
#    adm_expand.py 는 지우지 않고 남겨 둔다 — 빌더가 되돌아갔을 때 되살릴 자리다.
# 조용히 3개교로 줄면 대부분의 시험지에서 커트라인 박스가 «통째로» 사라진다. 눈으로 확인한다.
nadm=$(PYTHONIOENCODING=utf-8 python -c "import re,json,sys;print(len(json.loads(re.search(r'const ADM=(\{.*?\});',open(sys.argv[1],encoding='utf-8').read(),re.S).group(1))))" "$DIST/omr-v2.html")
if [ "$nadm" -lt 20 ]; then
  echo "  🔴 ADM 이 ${nadm}개교뿐이다 — 빌더가 워크북을 못 읽었다."; exit 1; fi
echo "  ✅ 입시결과 ${nadm}개교 내장(빌더 산출)."

echo
echo "== 4. 목표 문항 수 단위 패치 =="
# 🔴 «복사 뒤»에 와야 한다 — 2단계가 원본으로 덮어써 이 패치를 지우기 때문이다(2단계가 원본으로 덮어쓴다).
#    고치는 것: s.gapTop 은 «점수» 차인데 세 곳이 «문항 수»로 썼다. 배점이 있는 시험
#    (건국대 1-20번 3점·21-40번 2점 등)에서 56점→상위30% 73.5점이면 need=18(문항)이 되어
#    «틀린 19개 중 18개를 잡아라»가 학생 리포트로 나갔다(2026-08-31 사고). 실제로는 7~9문항이다.
#    📌 2026-09-02 에 원본(build_omr_app_v2.py)으로 승격했다 — 이제 «이미 적용됨»으로 건너뛴다.
#    사용자 지시로 이 단계는 «남긴다»: 재빌드가 이 수정을 잃으면 다시 붙여 주는 안전망이다. python 이 아니라 perl 인 이유 — Git Bash 에 항상 있어서다.
perl "$DIST/gap_fix.pl" "$DIST/omr-v2.html" || {
  echo "  🔴 목표 문항 수 패치에 실패했다."; exit 1; }
# 조용히 빠지면 틀린 리포트가 다시 나간다 — 파일에 «있는지» 눈으로 확인한다.
grep -q 's\.gapQ=0;' "$DIST/omr-v2.html" || {
  echo "  🔴 패치가 파일에 들어가지 않았다."; exit 1; }
echo "  ✅ 목표 문항 수는 «배점 누적» 기준이다."
echo
echo "== 5. 배포본 덧댐 패치 (약점 판정 · 학과명) =="
# 🔴 «복사 뒤»에 와야 한다 — 2단계가 원본으로 덮어써 이 패치를 지운다(3·4단계와 같은 이유).
#  A. 학과명 오타  「바이오메이컬공학전공」 → 「바이오메디컬공학전공」 (한국외대 자연계열 3곳).
#     진짜 출처는 exam-qa 의 data/admissions/admissions_workbook.json 이다. 거기를 고치면 A 는 저절로 건너뛴다.
#  B. 얇은 축 약점 보정  문항 4개뿐인 축은 1문항이 25%p라 값이 극단으로 튄다.
#     2022 한국외대 오전(논리·추론 4문항)에서 14명 중 6명의 «1순위 약점»을 이 축이 가져갔고,
#     3/4(75%)를 맞힌 학생까지 약점으로 잡혔다(2026-09-02 제보). 6→2명으로 줄었고 점수는 불변이다.
#     원본 빌더로 승격하면 «이미 적용됨»으로 건너뛰니 그때 이 단계를 지워라.
perl "$DIST/dist_fix.pl" "$DIST/omr-v2.html" || {
  echo "  🔴 배포본 덧댐 패치에 실패했다."; exit 1; }
# 조용히 빠지면 틀린 약점 판정과 오타가 다시 나간다 — 파일에 «있는지» 눈으로 확인한다.
grep -q 'SHRINK' "$DIST/omr-v2.html" || {
  echo "  🔴 약점 보정이 파일에 들어가지 않았다."; exit 1; }
if grep -q '바이오메이컬' "$DIST/omr-v2.html"; then
  echo "  🔴 학과명 오타가 남아 있다."; exit 1; fi
echo "  ✅ 약점 판정은 «얇은 축 보정» 기준이고, 학과명 오타는 없다."

echo
echo "== 6. 위생 검사 (개인정보 · 외부요청) =="
# 🔴 PYTHONIOENCODING 필수 — 안 주면 stdout 이 CP949 라 이모지에서 UnicodeEncodeError 가 난다.
#    그러면 위생 «위반»이 아니라 «검사기 고장»인데 실패로 잡혀 배포가 막힌다.
PYTHONIOENCODING=utf-8 python - "$DIST" <<'PY'
import sys, os, re, glob
dist = sys.argv[1]
bad = 0
for p in sorted(glob.glob(os.path.join(dist, "*.html"))):
    s = open(p, encoding="utf-8", errors="replace").read()
    name = os.path.basename(p)
    # 네트워크를 실제로 부르는 것만 본다 (XML 네임스페이스 URL 은 요청이 아니다)
    net = re.findall(r'(?:src|href)\s*=\s*["\'](https?://[^"\']+)', s)
    net = [u for u in net if "jbseo-commits.github.io" not in u]   # 해설집 링크는 허용
    dyn = len(re.findall(r'\bfetch\s*\(|XMLHttpRequest|WebSocket', s))
    tel = re.findall(r'01[016-9][-\s]?\d{3,4}[-\s]?\d{4}', s)
    mail = [m for m in re.findall(r'[\w.+-]+@[\w-]+\.[\w.]+', s) if "example" not in m]
    jumin = re.findall(r'\d{6}[-\s]?[1-4]\d{6}', s)
    flag = bool(net or dyn or tel or mail or jumin)
    bad += flag
    print("  %-14s 외부 %d · fetch류 %d · 전화 %d · 이메일 %d · 주민 %d %s"
          % (name, len(net), dyn, len(tel), len(mail), len(jumin), "🔴" if flag else "✅"))
    for u in net[:3]:  print("       외부:", u)
    for m in mail[:3]: print("       메일:", m)
sys.exit(4 if bad else 0)
PY
HYG=$?

echo
if [ "$HYG" != "0" ]; then
  echo "🔴 위생 검사에 걸렸다."
  if [ "$FORCE" != "1" ]; then
    echo "   공개 사이트다. 고친 뒤 다시 실행하라. 테스트 목적이면: ./배포.sh --force"
    exit 1
  fi
  echo "⚠️  --force 라 «알면서» 계속한다."
else
  echo "✅ 위생 검사 통과."
fi

echo
echo "== 7. 커밋 · 푸시 =="
cd "$DIST" || exit 1
git add index.html omr.html omr-v2.html .nojekyll robots.txt README.md .gitattributes adm_expand.py gap_fix.pl dist_fix.pl 배포.sh
if git diff --cached --quiet; then
  echo "  변경 없음 — 커밋 생략."
else
  git commit -m "재배포 $(date '+%Y-%m-%d %H:%M')" || exit 1
fi
if git remote get-url origin >/dev/null 2>&1; then
  git push && echo "  ✅ push 완료. Pages 반영에 최대 10분 걸린다(CDN 캐시)."
else
  echo "  ℹ️  origin 이 없다. README.md 의 «최초 1회» 절차를 먼저 하라."
fi
