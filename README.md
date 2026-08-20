# ParkingHunters
대구 주차장 탐색 앱

## Cloudtype 배포

대구시 API가 해외 IP를 차단하기 때문에 국내 리전에서 실행해야 한다. 배포는 루트의
`Dockerfile`을 사용한다(Cloudtype 콘솔에서 앱 생성 시 "Dockerfile" 타입으로 선택).

1. Cloudtype에서 이 저장소를 연결하고 앱 타입을 Dockerfile로 선택, 포트는 `3000`.
2. 환경 변수는 `.env.example`에 정리된 목록을 그대로 콘솔의 환경 변수 설정에 입력한다
   (파일을 업로드하는 게 아니라 값만 복사해 넣는 용도).
3. `DAEGU_PARKING_INFO_KEY`/`DAEGU_PARKING_CONGESTION_KEY`는 IP 화이트리스트 방식이라,
   Cloudtype이 실제로 쓰는 아웃바운드 IP를 대구시 쪽에 등록해야 401이 나지 않는다.
   (예전엔 이걸 우회하려고 Fixie 고정 IP 프록시를 썼는데, 그 프록시 IP 자체가 대구시
   쪽에서 막혀 있는 게 확인돼 관련 코드를 전부 제거했다 — 이제 항상 직접 호출한다.)
   Cloudtype의 아웃바운드 IP를 확인해서 대구시 쪽에 등록 요청할 것.
4. `NEXT_PUBLIC_KAKAO_JS_KEY`를 쓰는 카카오 개발자센터 플랫폼 설정에 배포 도메인
   (예: `https://<app>.cloudtype.app`)을 Web 플랫폼으로 추가해야 지도가 뜬다.
