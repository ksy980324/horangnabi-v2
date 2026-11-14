const providerReasons = new Set([
  'SERVICE_DISABLED', 'BILLING_DISABLED', 'API_KEY_INVALID', 'API_KEY_EXPIRED',
  'API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_IP_ADDRESS_BLOCKED',
  'CONSUMER_INVALID', 'RATE_LIMIT_EXCEEDED', 'QUOTA_EXCEEDED',
]);
export function safeProviderReason(value:unknown):string|undefined {
  return typeof value==='string'&&providerReasons.has(value)?value:undefined;
}
export function recommendationErrorMessage(status:number,body:unknown):string {
  const error=body as {reason?:string;providerStatus?:number;providerCode?:string}|null;
  if(status===401) return '로그인이 만료되었어요. 다시 로그인해 주세요.';
  if(error?.reason==='budget-unavailable') return '추천 서버의 사용량 저장소에서 오류가 발생했어요. Google 호출을 중단했어요. (BUDGET_UNAVAILABLE)';
  if(error?.reason==='google-unavailable') return '추천 서버에서 Google에 연결하지 못했어요. 잠시 후 다시 시도해 주세요. (GOOGLE_UNAVAILABLE)';
  if(error?.reason==='google') {
    const code=safeProviderReason(error.providerCode);
    const messages:Record<string,string>={
      SERVICE_DISABLED:'서버 키가 속한 프로젝트에서 Places API (New)를 활성화해 주세요.',
      BILLING_DISABLED:'서버 키가 속한 Google Cloud 프로젝트의 결제 계정 연결을 확인해 주세요.',
      API_KEY_INVALID:'서버에 등록된 Places API 키가 유효하지 않아요. Worker secret을 확인해 주세요.',
      API_KEY_EXPIRED:'서버에 등록된 Places API 키가 만료되었어요.',
      API_KEY_SERVICE_BLOCKED:'서버 키의 API 제한에서 Places API (New)를 허용해 주세요.',
      API_KEY_HTTP_REFERRER_BLOCKED:'서버 전용 키에 웹사이트 제한이 적용되어 있어요. 서버 키 설정을 확인해 주세요.',
      API_KEY_IP_ADDRESS_BLOCKED:'서버 전용 키의 IP 제한으로 Google 요청이 거절되었어요.',
      CONSUMER_INVALID:'Google API 키가 속한 프로젝트 상태를 확인해 주세요.',
      RATE_LIMIT_EXCEEDED:'Google Places 요청 속도 한도에 도달했어요. 잠시 후 다시 시도해 주세요.',
      QUOTA_EXCEEDED:'Google Places 할당량에 도달했어요. Google Cloud의 Places 한도를 확인해 주세요.',
    };
    const http=typeof error.providerStatus==='number'&&Number.isInteger(error.providerStatus)&&error.providerStatus>=400&&error.providerStatus<=599?'HTTP '+error.providerStatus:'응답 오류';
    return (code?messages[code]:status===429?'Google Places 할당량 또는 요청 속도 한도에 도달했어요.':'Google에서 추천 요청을 거절했어요.')+' ('+http+(code?' / '+code:'')+')';
  }
  if(status===429) return '무료 운영을 위한 오늘 또는 이번 달 조회 한도에 도달했어요. 일정 편집은 계속할 수 있어요.';
  if(status===503||status===404) return '추천 서버 설정이 필요해요. Places API 키와 서버 배포를 확인해 주세요.';
  return '추천 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';
}
