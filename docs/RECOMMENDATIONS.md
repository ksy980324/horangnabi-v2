# 추천 장소

여행 상세의 추천 장소 버튼으로 연다. 날짜와 관심 분류를 고르면 추천 순서와 이유가 바뀐다. 보관함에 저장하거나 선택 날짜 마지막 일정에 시간 미정으로 추가한다. 저장 실패는 안내하며 임의로 성공 처리하지 않는다.

현재 목록은 요나고 3곳·오사카 4곳으로 한정한 시범 목록이다. 개별 식당·카페의 평점 자료나 실시간 추천 API는 없다. 같은 이름·등록된 현지어/영문 별칭·지도 링크를 이미 일정이나 보관함에 담았으면 제외한다. 이름이 크게 다른 미등록 별칭은 중복을 감지하지 못할 수 있다.

순서는 선택 분류 일치 30점, 선택 날짜 마지막 좌표 또는 여행 도시에서의 직선 거리 30/(1+km), 기본 목록 순서의 작은 가산점을 합산한다. 좌표가 없으면 분류와 기본 순서를 사용한다. 전체 일정의 실제 이동 경로를 최적화하지 않으며 추천 점수를 별점으로 표현하지 않는다.

위치는 시설 입구나 개별 가게를 보장하지 않는 지역 대표 지점 근사치다. 식당 영업·운영 시간·휴무·요금은 방문 전 출처에서 확인한다. 설명은 아래 안내의 사실을 바탕으로 짧게 작성했으며 원문이나 사진을 복제하지 않았다. 확인일: 2026-11-14.

- 요나고성 터: https://www.yonago-navi.jp/yonago/shitamachi/sightseeing/yonago-castle-trace/
- 가이케 온천: https://www.yonago-navi.jp/yonago/kaike/sightseeing/kaikeonsen
- 가이케 해변: https://www.yonago-navi.jp/yonago/kaike/experience-culture/beach-kaike
- 오사카 관광 안내(오사카성·신세카이): https://osaka-info.jp/experience/ja/osaka/spot
- 도톤보리: https://www.osaka-info.jp/spot/dotonbori/
- 구로몬 시장: https://osaka-info.jp/experience/ja/osaka/spot/208

목록 확장은 src/services/recommendations.ts에서 관리한다. 출처를 확인한 장소만 추가하고 리뷰 수·평점·실시간 영업 여부를 추측해 넣지 않는다. 새 유료 API는 별도 승인 없이 추가하지 않는다.
