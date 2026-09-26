# 자동 품의 요구 생성기 (AutoRequisitionGenerator)

쇼핑몰 주문서·장바구니 화면을 캡처하면 품목(품목명·규격·수량·예상단가·배송비)을 자동 추출해
품의 서식 엑셀(`품목내역(통합).xls`)에 저장해 주는 중학교 교사용 Electron 데스크톱 앱입니다.

## 주요 기능

- **원클릭 품의캡처** — Chrome/Edge/웨일 익스텐션 또는 북마크바 버튼으로 현재 화면을 앱으로 전송
- **장바구니 V체크 반영** — 체크한 상품만 자동 추출 (익스텐션·북마크릿 캡처 기준)
- **내장 규칙 34종** — G마켓·네이버쇼핑·쿠팡·11번가·다이소몰·티처몰·알라딘·교보문고·예스24·옥션·아이스크림몰·알파몰·드림디포·오피스디포·엘레파츠·IC114·롯데마트 제타 등 주문서/장바구니 자동 인식
- **수량·단가 자동 환산** — 화면에 합계만 있어도 단가 = 합계 ÷ 수량으로 계산, 10원 단가 올림 적용
- **규격 자동 생성** — 상품명·옵션에서 규격(예: `355ml, 20개입, 1상자`) 자동 추출
- **배송비 자동 처리** — 그룹별 배송비 합산, 조건부 무료, 상품별 배송비 행 등 몰 특성 반영
- **엑셀 교체 저장** — 현재 표 내용으로 서식 파일 교체 저장(.bak 자동 백업), 배송비 가격별 합산
- **매핑(학습) 기능** — 미지원 쇼핑몰은 화면에서 요소를 클릭해 나만의 규칙 생성 가능
- **▣ 반반 화면 분할** — 미리보기를 숨기고 창을 화면 오른쪽 절반에 스냅해 품의 결재 시스템 등 다른 프로그램과 나란히 사용

## 다운로드 · 실행

루트의 **`자동품의요구생성기_Portable.exe`**를 실행합니다(포터블, 설치 불필요).

1. 브라우저에서 쇼핑몰 주문서(또는 장바구니) 화면까지 진행
2. **품의캡처**(익스텐션 아이콘 또는 북마크바의 🛒품의캡처) 클릭
3. 앱 좌측 뷰어에서 원문 확인, 우측 표에서 품목 확인·수정
4. **엑셀에 저장**으로 서식 엑셀에 저장

> 앱 최초 실행 후 [북마크바 추가]·[익스텐션 추가] 버튼으로 캡처 수단을 설정하세요.
> 상세 사용법은 앱 내 `resources/manual.pdf` 를 참고하세요.

## 개발자 가이드

모든 소스는 `app/` 폴더에 있습니다.

```powershell
cd app
npm install          # 최초 1회

npm run dev          # 개발 (electron-vite)
npm run build        # out/ 번들 생성

# E2E 자가테스트 (단위 테스트 프레임워크 없음 — JSON 결과 출력)
$env:E2E='1'; $env:E2E_DIR="..\shoping_cart"; $env:E2E_OUT="..\e2e-result.json"; npx electron .

# 패키징 (portable exe)
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win portable --config.win.signAndEditExecutable=false
```

규칙 검증 스크립트(`app/analysis/`):

```powershell
node analysis\test-rule.js <rule.json> <capture.mhtml>   # 단일 규칙 추출 결과 확인
node analysis\test-cart-fix.js                            # v1.7.3 버그 수정 회귀 스위트
node analysis\test-feedback.js                            # 기존 회귀 스위트
```

## 프로젝트 구조

```
app/                    소스 전체
 ├─ src/main/           창·IPC·app-mhtml:// 프로토콜·수신 서버·E2E 진입
 │   └─ lib/            mhtml 파서·규칙 엔진(extract)·규칙(rules/*.json)·엑셀·북마크·수신기
 ├─ src/renderer/       React 18 + Zustand + Tailwind v4 UI
 ├─ extension/          Chrome MV3 익스텐션 (품의캡처)
 └─ analysis/           규칙 검증·정답 대조·디버그 스크립트
자동품의요구생성기_Portable.exe   배포 파일 (release 빌드 사본)
SUMMARY.MD 등           as-built 명세 문서
```

- 사용자 데이터: `%APPDATA%\자동 품의 요구 생성기\` (settings.json, rules/, inbox/, extension/)
- 수신 포트: 57330~57335 (단일 인스턴스 잠금)

## 문서

| 문서 | 내용 |
|---|---|
| [SUMMARY.MD](SUMMARY.MD) | 세션 인계용 요약 — 버전·기능·IPC 총정리 (**가장 최신**) |
| [SYSTEM.md](SYSTEM.md) | 아키텍처 |
| [ALGO.md](ALGO.md) | 파싱/규칙 엔진 알고리즘과 규칙 스키마 |
| [excel.MD](excel.MD) | 엑셀 저장(BIFF8) 상세 |
| [Book.MD](Book.MD) | 북마크바 관리 |
| [Extension.MD](Extension.MD) | 익스텐션/북마크릿 캡처 채널 |
| [UIUX.md](UIUX.md) | 화면·인터랙션 |
| [RPD.md](RPD.md) | 요구사항·문제 이력 |

> 문서와 코드가 충돌하면 코드가 사실입니다.
