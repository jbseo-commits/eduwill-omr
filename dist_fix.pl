#!/usr/bin/env perl
# 편입영어 OMR 진단기 — 배포본 덧댐 패치 (원본 exam-qa 로 승격되기 전까지)
#
# A. 학과명 오타      「바이오메이컬공학전공」 → 「바이오메디컬공학전공」 (한국외대 자연계열)
#                     진짜 출처는 data/admissions/admissions_workbook.json 이다.
# B. 얇은 축 약점 보정 문항 4개뿐인 축은 1문항이 25%p라 값이 극단으로 튄다.
#
# 🔴 줄바꿈에 의존하지 않는다 — 빌더 산출물이 2026-09-02 에 LF→CRLF 로 바뀐 전례가 있다.
#    여러 줄 패턴은 \r?\n 으로 맞추고, 넣는 쪽은 «그 파일이 쓰는» 줄바꿈을 따른다.
# 멱등이다 — A·B 각각 따로 판단해 이미 된 쪽만 건너뛴다.
use strict; use warnings;
my $f = shift or die "사용법: dist_fix.pl <omr-v2.html>\n";
open(my $in, "<:raw", $f) or die "열 수 없다: $f — $!\n";
local $/; my $d = <$in>; close $in;
my $before = length $d;
my $eol = ($d =~ /\r\n/) ? "\r\n" : "\n";     # 이 파일이 쓰는 줄바꿈
my @msg; my $did = 0;

# ── B 먼저 «검사»만 한다 (중간에 죽어서 A 만 반영되는 일을 막는다) ──
my $Bdone = ($d =~ /SHRINK/) ? 1 : 0;
my @Bfrom = (
 's.weak=s.profile.filter(x=>x.r<=ov-0.08||x.r<0.40).sort((a,b)=>a.r-b.r).slice(0,3);',
 'if(!s.weak.length&&ov<0.70&&s.profile.length)s.weak=[...s.profile].sort((a,b)=>a.r-b.r).slice(0,2);',
 's.strong=s.profile.filter(x=>x.r>=ov+0.12).sort((a,b)=>b.r-a.r).slice(0,2);',
);
my $Bre = join('\r?\n\ \ ', map { quotemeta } @Bfrom);
$Bre = qr/\ \ $Bre/;
unless ($Bdone) {
  my $c = () = $d =~ /$Bre/g;
  die "  🔴 B 패치 대상이 ${c}곳이다(1이어야). 원본이 바뀌었다 — 아무것도 쓰지 않고 중단한다.\n" if $c != 1;
}

# ── A. 학과명 오타 ───────────────────────────────────────────────
if ($d =~ /바이오메이컬공학전공/) {
  my $n = () = $d =~ /바이오메이컬공학전공/g;
  $d =~ s/바이오메이컬공학전공/바이오메디컬공학전공/g;
  push @msg, "  ✅ A 학과명 오타 ${n}곳 교정"; $did++;
} else { push @msg, "  ℹ️  A 이미 교정돼 있다."; }

# ── B. 얇은 축 약점 보정 ─────────────────────────────────────────
if ($Bdone) { push @msg, "  ℹ️  B 이미 적용돼 있다(원본 승격됐으면 이 단계를 지워라)."; }
else {
  my @to = (
   '// 🔴 얇은 축 보정 — 문항이 4개뿐인 축은 1문항이 25%p라 값이 극단으로 튄다.',
   '//    2022 한국외대 오전(논리·추론 4문항)에서 14명 중 6명의 «1순위 약점»을 이 축이 가져갔고,',
   '//    3/4(75%)를 맞힌 학생까지 약점으로 잡혔다(2026-09-02 제보).',
   '//    학생 «자신의» 전체 정답률(ov)로 끌어당긴 보정값 radj 로 «판정·정렬만» 한다.',
   '//    화면에 찍히는 정답률(x.acc)은 실측 그대로다 — 숫자를 지어내지 않는다.',
   '//    SHRINK=6 은 «사전 표본 6문항» 상당. 문항 많은 축은 거의 안 움직이고 얇은 축만 눌린다.',
   '//    computePlan 이 s.weak 을 물려받으므로 학습계획·기출추천도 함께 보정된다.',
   'const SHRINK=6, radj=x=>(Math.round(x.r*x.nq)+SHRINK*ov)/(x.nq+SHRINK);',
   's.weak=s.profile.filter(x=>radj(x)<=ov-0.08||radj(x)<0.40).sort((a,b)=>radj(a)-radj(b)).slice(0,3);',
   'if(!s.weak.length&&ov<0.70&&s.profile.length)s.weak=[...s.profile].sort((a,b)=>radj(a)-radj(b)).slice(0,2);',
   's.strong=s.profile.filter(x=>radj(x)>=ov+0.12).sort((a,b)=>radj(b)-radj(a)).slice(0,2);',
  );
  my $rep = join($eol, map { '  '.$_ } @to);
  $d =~ s/$Bre/$rep/;
  push @msg, "  ✅ B 얇은 축 약점 보정 적용"; $did++;
}

print "$_\n" for @msg;
if (!$did) { print "  ℹ️  바뀐 것이 없다.\n"; exit 0; }
open(my $out, ">:raw", $f) or die "쓸 수 없다: $f — $!\n";
print $out $d; close $out;
printf "  ✅ 패치 완료 — %d → %d bytes (%+d) · 줄바꿈 %s\n",
  $before, length($d), length($d)-$before, ($eol eq "\r\n" ? "CRLF" : "LF");
