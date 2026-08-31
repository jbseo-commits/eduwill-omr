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
echo "== 3. 입시결과 커버리지 확장 =="
# 🔴 반드시 «복사 뒤»에 온다 — 2단계가 원본으로 덮어써 이 패치를 지우기 때문이다.
#    원본 빌더(build_omr_app_v2.py)는 Codex 락이라 손대지 않고, 배포본에만 덧댄다.
#    락이 풀려 빌더가 워크북을 직접 읽게 되면 이 단계는 «지워야» 한다(이중 적용은 아니지만 불필요).
PYTHONIOENCODING=utf-8 python "$DIST/adm_expand.py" "$DIST/omr-v2.html" || {
  echo "  🔴 입시결과 확장에 실패했다."; exit 1; }

echo
echo "== 4. 위생 검사 (개인정보 · 외부요청) =="
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
echo "== 5. 커밋 · 푸시 =="
cd "$DIST" || exit 1
git add index.html omr.html omr-v2.html .nojekyll robots.txt README.md .gitattributes adm_expand.py 배포.sh
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
