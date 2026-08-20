# ParkingHunters
대구 주차장 탐색 앱

## Cloudtype 배포

대구시 API가 해외 IP를 차단하기 때문에 국내 리전에서 실행해야 한다. 배포는 루트의
`Dockerfile`을 사용한다(Cloudtype 콘솔에서 앱 생성 시 "Dockerfile" 타입으로 선택).

1. Cloudtype에서 이 저장소를 연결하고 앱 타입을 Dockerfile로 선택, 포트는 `3000`.
2. 환경 변수는 `.env.example`에 정리된 목록을 그대로 콘솔의 환경 변수 설정에 입력한다
   (파일을 업로드하는 게 아니라 값만 복사해 넣는 용도).
3. `DAEGU_PARKING_INFO_KEY`/`DAEGU_PARKING_CONGESTION_KEY`는 IP 화이트리스트 방식이다.
   Cloudtype은 고정 아웃바운드 IP를 지원하지 않아 재배포마다 나가는 IP가 바뀌므로
   (2026-08-20 실측: 34.64.220.67 → 34.64.184.142), Cloudtype IP를 직접 등록하는
   방식은 재배포할 때마다 다시 깨진다. 그래서 `FIXIE_URL`(고정 IP 프록시)을 다시
   거치도록 되돌렸다 — 그 프록시의 실제 출구 IP(현재 확인된 값: `52.5.155.132`,
   `criterium.usefixie.com`)를 대구시 쪽에 한 번만 등록하면 이후 재배포와 무관하게
   계속 통과한다. **아직 그 IP가 대구시에 등록되지 않아서 지금은 401 → 더미 목록으로
   폴백 중이다.**
4. `FIXIE_URL` 값을 Cloudtype 환경변수에도 등록할 것(`.env.local`에 있는 값과 동일).
5. `NEXT_PUBLIC_KAKAO_JS_KEY`를 쓰는 카카오 개발자센터 플랫폼 설정에 배포 도메인
   (예: `https://<app>.cloudtype.app`)을 Web 플랫폼으로 추가해야 지도가 뜬다.
