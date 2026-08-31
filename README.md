# 편입영어 OMR 진단기 — 배포 저장소

학원 양식 OMR 엑셀을 올리면 자동 채점 → 능력·함정 분석 → 학생별 A4 진단 리포트까지 내는
**단일 HTML 웹앱**이다. 설치·서버가 필요 없고, 처리는 전부 브라우저 안에서 일어난다.

```
https://jbseo-commits.github.io/eduwill-omr/          ← 목차
https://jbseo-commits.github.io/eduwill-omr/omr-v2.html   ← 진단기(권장)
https://jbseo-commits.github.io/eduwill-omr/omr.html      ← 진단기(기본판)
```

| | |
|---|---|
| 원본 저장소 | `exam-qa` (별개 git · 이 폴더는 «배포본만» 담는다) |
| 갱신 | `cd /c/Users/jbseo/Desktop/exam-dist-omr && ./배포.sh` |
| 반영 지연 | 최대 10분 (GitHub Pages CDN 캐시) |

## 파일

| 배포본 | 원본 | 내용 |
|---|---|---|
| `index.html` | (이 저장소에서 직접 작성) | 목차 — 진단기 2종 + 해설집 링크 |
| `omr-v2.html` | `app/OMR진단기_v2.html` | 레이더·함정·배점 반영 최신판 |
| `omr.html` | `app/OMR진단기.html` | 레이더 없는 기본판 |

🔴 **`index.html` 은 원본이 여기에 있다.** `배포.sh` 가 덮어쓰지 않으므로 직접 고친다.
나머지 둘은 `배포.sh` 가 `exam-qa/app/` 에서 **복사해 덮어쓴다** — 여기서 고치지 말 것.

## ✅ 개인정보 — 공개해도 되는 이유

실측으로 확인한 것(`배포.sh` 3단계가 매번 다시 검사한다):

| | |
|---|---|
| `fetch`·`XMLHttpRequest`·`WebSocket` | **0건** — 올린 파일이 브라우저 밖으로 나가지 않는다 |
| 외부 `src`/`href` | **0건** — 폰트·스크립트·이미지 전부 내장 |
| 전화·이메일·주민번호 내장 | **0건** |
| 학생 명단 내장 | **0건** — 앱은 업로드한 파일을 읽을 뿐 아무것도 담고 있지 않다 |

리포트의 학생 표기는 기본이 **익명**(`학생01`…)이고, 시트의 행 순서만 쓴다.
「실명 표시」 체크박스를 켜야 이름이 나오며 이는 인쇄물에만 적용된다.

> ⚠️ `http://` 로 시작하는 문자열이 파일 안에 보이는데, 이는 내장된 SheetJS 의
> **XML 네임스페이스 식별자**다(`docs.oasis-open.org/ns/office/…`). 네트워크 요청이 아니다.
> `배포.sh` 의 검사가 `src`/`href` 속성만 보는 이유가 이것이다 — 문자열로 grep 하면 오탐이 난다.

## 🔴 알고 올린 것 — 태깅 DB가 통째로 들어 있다

```
const ALL={"years":["2022","2023","2024","2025"], "tagdb":{…}}     약 497,000자
문항별 정답 · 유형 · 등급 · 함정유형 · 인지부하 · 정답률
```

**저장소가 Public 이라 `git clone` 한 번으로 4개 연도 태깅 데이터가 통째로 복제된다.**
분석 IP 자체가 공개된다는 뜻이다. 2026-08-31 사용자 결정으로 «알면서» 이렇게 했다.

- `robots.txt` 로 크롤러는 막아 두었다(`Disallow: /`). **검색 노출은 줄지만 clone 은 못 막는다.**
- 막으려면 **GitHub Pro(약 $4/월)** 로 저장소를 Private 으로 돌려야 한다.
  🔴 **Pro 여도 «사이트»는 공개다** — 숨겨지는 것은 소스 저장소뿐이고, 결제 검증은 어느 플랜으로도 안 된다.

## 최초 1회 — GitHub 연결

**계정 `jbseo-commits` · 저장소 `eduwill-omr`**

1. GitHub 에서 저장소를 만든다 — **Public** · 초기화 파일(README·.gitignore·license) **전부 없이**.
2. ```
   git remote add origin https://github.com/jbseo-commits/eduwill-omr.git
   git push -u origin master
   ```
3. 저장소 **Settings → Pages → Source: Deploy from a branch → `master` / `(root)`** 저장.

### 🔴 커밋 신원 — Public 이라 반드시 먼저 볼 것

```
git config user.name  jbseo-commits
git config user.email 322935897+jbseo-commits@users.noreply.github.com
```

**이 저장소에만 로컬로** 걸었다. 미설정으로 두면 git 이 `사용자명@호스트명` 으로 신원을 지어내
**`서정빈_편입사업부 <jbseo@eduwill.net>`** 로 커밋이 찍힌다. Public 에 push 하면
실명·부서·회사 이메일이 공개 커밋 기록에 **영구히** 남는다.
(`exam-dist-2022` 에서 실제로 그렇게 찍혀 `git rebase --root` 로 전 커밋을 다시 쓴 전례가 있다.)

검증: `git log --format='%an <%ae> / %cn <%ce>' | grep -c eduwill.net` → **0**

## 🔴 함정 — 다음 사람도 밟는다

1. **`core.autocrlf=true` 가 HTML 을 줄인다.**
   `.gitattributes` 의 `*.html -text` 로 막아 두었고, 이 저장소는 **첫 커밋 전에** 넣었다.
   🔴 나중에 넣으면 늦는다 — 속성은 **이미 스테이징된 내용을 소급해 고치지 않는다.**
   그때는 `git rm --cached` → `git add` 로 다시 담아야 한다(`exam-dist-2022` 의 `87e5212` 가 그 사고다).
   📌 **「작업 복사본의 해시」와 「저장소 blob 의 해시」는 다른 것이다.**
   검증은 원격에서 **내려받아** 하라: `curl -sL <URL> -o x && sha256sum x`.
2. 🔴 **사내망에서 `git push`·`curl` 이 막힌다.**
   `Recv failure: Connection was reset` · `curl github.com` 타임아웃(HTTP 000).
   **그런데 브라우저는 열린다** — 전체 장애가 아니라 망 정책이다.
   ✅ **네트워크를 바꾸면(핫스팟 등) 통과한다.**
3. **CDN 캐시 10분** — push 직후엔 옛 화면이 보인다. 확인은 `?cb=난수` 로 우회하라.
4. **한글 파일명을 쓰지 않았다.** 저장소 이름·파일명은 URL 경로에 그대로 들어가
   퍼센트 인코딩되면 링크가 길어져 카톡·문자에서 깨진다. 화면 제목은 한글 그대로다.

## 관련

- 2022 기출 해설집 — <https://jbseo-commits.github.io/eduwill-bupyeong-2022/>
  (저장소 `jbseo-commits/eduwill-bupyeong-2022` · 배포 폴더 `../exam-dist-2022`)
