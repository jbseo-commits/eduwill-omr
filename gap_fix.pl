#!/usr/bin/env perl
# 편입영어 OMR 진단기 — «목표까지 몇 문항» 단위 버그 패치
#
# 무엇을 고치나: s.gapTop 은 «점수» 차인데 세 곳이 그것을 «문항 수»로 썼다.
#   배점이 있는 시험(예 1-20번 3점 · 21-40번 2점)에서 56점 → 상위30% 73.5점이면
#   gapTop=18(점) 이 그대로 need=18(문항) 이 되어 «틀린 19개 중 18개를 잡아라»가 나왔다.
#   실제로는 3점짜리 6개 ~ 2점짜리 9개면 된다. (2026-08-31 제보)
#
# 고치는 방법: 회복이 싼 순(반 정답률 높은 순)으로 «배점»을 누적해 실제 문항 수 s.gapQ 를 센다.
#   배점이 없는 시험은 pointOf()가 1이라 gapQ===gapTop 이 되어 종전과 동작이 같다.
#
# 멱등이다 — 이미 패치된 파일에 다시 돌리면 «이미 적용됨»만 찍고 끝난다.
use strict; use warnings;
my $f = shift or die "사용법: gap_fix.pl <omr-v2.html>\n";
open(my $in, "<:raw", $f) or die "열 수 없다: $f — $!\n";
local $/; my $d = <$in>; close $in;
my $before = length $d;

if ($d =~ /s\.gapQ=0;/) { print "  ℹ️  이미 적용돼 있다 — 건너뛴다.\n"; exit 0; }

my @P = (
 # ① gapQ 계산을 gapTop 바로 옆에서 만든다 (단일 출처)
 ['  s.gapTop=s.tier?Math.max(1,Math.round(s.tier.score-s.score)):0;',
  '  s.gapTop=s.tier?Math.max(1,Math.round(s.tier.score-s.score)):0;'."\n".
  '  // 🔴 gapTop 은 «점수» 차다 — «문항 수»가 아니다. 배점이 있는 시험(1-20번 3점·21-40번 2점 등)에서'."\n".
  '  //    이걸 문항 수로 쓰면 «틀린 19개 중 18개를 잡아라»가 나온다(2026-08-31 사고). 실제론 6~9문항이었다.'."\n".
  '  //    gapQ = 회복이 싼 순(반 정답률 높은 순)으로 «배점»을 누적해 격차를 메우는 데 필요한 문항 수.'."\n".
  '  //    배점이 없으면 pointOf()가 1이라 gapQ===gapTop 이 되어 종전과 같다(하위 호환).'."\n".
  '  //    걸러내는 조건은 wrongPageHTML 의 rows 와 «같아야» 한다 — 표의 가로줄 위치가 이 값이다.'."\n".
  '  s.gapQ=0;'."\n".
  '  if(s.tier){const wq=qlist.filter(q=>{const k=km[q].key,a=s.ans[q];'."\n".
  '     return k&&k!==\'None\'&&(a==null||String(a)!==String(k));}).sort((x,y)=>itemByQ[y].p-itemByQ[x].p);'."\n".
  '   let acc=0;for(let i=0;i<wq.length;i++){acc+=pointOf(wq[i],SCORECTX);if(acc>=s.gapTop){s.gapQ=i+1;break;}}'."\n".
  '   if(!s.gapQ)s.gapQ=wq.length;}   // 다 잡아도 못 넘는 경우 — 있는 만큼으로 둔다'],

 # ② 서술문: 문항 수(r.gain)와 점수(gapTop)를 비교하던 것을 문항 수끼리 비교로
 ['   if(r.gain>=s.gapTop)P.push(',
  '   if(s.gapQ&&r.gain>=s.gapQ)P.push('],

 # ③ 서술문: «더 맞혀야 할 18문항» — 점수를 문항이라 찍던 자리
 ['더 맞혀야 할 ${Math.round(s.gapTop)}문항',
  '더 맞혀야 할 ${s.gapQ}문항'],

 # ④ 뒷면 표의 가로줄 위치 — 이 사고의 진원지
 [' const need=s.tier?Math.max(1,Math.round(s.gapTop)):0;',
  ' const need=s.tier?Math.min(s.gapQ||0,rows.length):0;'],

 # ⑤ 남은 걸 다 잡아야 도달하는 경우엔 «위 N개만 잡아도»를 띄우지 않는다
 ["+(need?' · 위 '+need+",
  "+(need&&need<rows.length?' · 위 '+need+"],
);

my $n = 0;
for my $p (@P) {
  my ($from, $to) = @$p;
  my $cnt = () = $d =~ /\Q$from\E/g;
  if ($cnt != 1) { die "  🔴 ".($n+1)."번 패치 대상이 $cnt 곳이다(1이어야 한다). 원본이 바뀌었다 — 중단한다.\n"; }
  $d =~ s/\Q$from\E/$to/;
  $n++;
  printf "  ✅ %d/%d 적용\n", $n, scalar(@P);
}

open(my $out, ">:raw", $f) or die "쓸 수 없다: $f — $!\n";
print $out $d; close $out;
printf "  ✅ 패치 완료 — %d → %d bytes (+%d)\n", $before, length($d), length($d)-$before;
