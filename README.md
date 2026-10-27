# 스마트 단체 여행 매니저 (Ver 1.5 + 확장판)

원본 기능 전체 + 아래 추가 사항이 들어 있는 단일 HTML 앱입니다.

| 구분 | 내용 |
|---|---|
| 지도 앱 선택 | 상단 [● 네이버] 버튼 → 네이버지도 / 카카오맵 / 티맵 / 구글맵. [지도]·[길찾기] 버튼 전체 적용, 기기에 저장 |
| 이동 수단 | 자동차 / 대중교통 / 도보 (구글맵·카카오맵 적용) |
| 해외 여행 | 해외 여행은 자동으로 구글맵 연결 (카카오맵·티맵은 해외 미지원) |
| 여행도구 탭 | D-day·여행 일차, 일정 수·총지출·1인당, 여행지 날씨, 현지 시각·시차, 환율 계산기, 안전·긴급 연락 |
| 디자인 | Paper & Ink + 매거진 테마 — 크림 페이퍼, 네이비 잉크, 커버형 여행 카드, 이탤릭 마스트헤드, 사진 D-day 커버. 규칙은 `DESIGN.md` |

## 처음 1회 설정 (약 15분)

`index.html` 상단에 원작자 키 대신 자리표시자가 들어 있습니다. 본인 키 3개를 넣으세요.

1. **Firebase (데이터 저장)**
   - https://console.firebase.google.com → 프로젝트 만들기 → Firestore Database 만들기
   - 프로젝트 설정 → 내 앱 → 웹 앱 추가 → 표시되는 설정값을 `firebaseConfig` 블록에 붙여넣기
2. **카카오맵 (국내 지도 화면)**
   - https://developers.kakao.com → 내 애플리케이션 → 앱 추가 → JavaScript 키 복사
   - 플랫폼 → Web → 사이트 도메인에 배포 주소 등록 (예: `https://아이디.github.io`)
   - 제품 설정 → 카카오맵 → 활성화 ON (2024.12 이후 신규 앱 필수)
   - `appkey=YOUR_KAKAO_JAVASCRIPT_KEY` 교체
3. **구글맵 (해외 지도 화면)**
   - https://console.cloud.google.com → 결제 계정 연결 → Maps JavaScript API, Geocoding API 사용 설정 → API 키 생성
   - 키 제한: HTTP 리퍼러에 배포 주소 등록
   - `key=YOUR_GOOGLE_MAPS_API_KEY` 교체

> 길찾기·지도 앱 버튼, 날씨, 환율은 키 없이 동작합니다.

## 배포 (GitHub Pages)

1. GitHub에 새 저장소 생성 → 이 폴더의 파일 전체 업로드
2. Settings → Pages → Branch: `main` / `(root)` → Save
3. 1~2분 후 `https://아이디.github.io/저장소이름/` 접속

## 참고

- 날씨: Open-Meteo (예보는 약 16일 이내만 제공)
- 환율: ExchangeRate-API 무료 엔드포인트 (하루 1회 갱신, 참고용 시세)
- 티맵은 휴대폰에 앱이 설치된 경우에만 열리며, 현재 위치 → 목적지로 안내합니다
- 원본: https://ohyaksa.github.io/group-trip-app/ (저장소에 라이선스 표기가 없으므로, 공개 배포 시 원작자 동의를 권장)
