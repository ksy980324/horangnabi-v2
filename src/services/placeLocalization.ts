import { koreanAirportName } from './searchQuery.ts';

const key = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[\s·・()（）.,'-]/g, '');
const nameEntries: [string[], string][] = [
  [['Osaka Castle', '大阪城'], '오사카성'],
  [['Osaka Castle Park', '大阪城公園'], '오사카성 공원'],
  [['Dotonbori', '道頓堀'], '도톤보리'],
  [['Kuromon Market', 'Kuromon Ichiba Market', '黒門市場'], '구로몬 시장'],
  [['Umeda Sky Building', '梅田スカイビル'], '우메다 스카이 빌딩'],
  [['Tsutenkaku', '通天閣'], '쓰텐카쿠'],
  [['Universal Studios Japan', 'ユニバーサル・スタジオ・ジャパン'], '유니버설 스튜디오 재팬'],
  [['Osaka Aquarium Kaiyukan', 'Kaiyukan', '海遊館'], '오사카 가이유칸 수족관'],
  [['Shinsaibashi', '心斎橋'], '신사이바시'],
  [['Namba Station', 'Nanba Station', 'なんば駅', '難波駅'], '난바역'],
  [['Osaka Station', '大阪駅'], '오사카역'],
  [['Shin-Osaka Station', '新大阪駅'], '신오사카역'],
  [['Kyoto Station', '京都駅'], '교토역'],
  [['Don Quijote', 'Don Quixote', 'ドン・キホーテ'], '돈키호테'],
  [['MEGA Don Quijote', 'MEGAドン・キホーテ'], '메가 돈키호테'],
  [['Don Quijote Dotonbori', 'ドン・キホーテ道頓堀店'], '돈키호테 도톤보리점'],
  [['Don Quijote Sakuranomiya shop'], '돈키호테 사쿠라노미야점'],
  [['MEGA Don Quijote Fukaebashi'], '메가 돈키호테 후카에바시점'],
  [['YES NAMBA'], '예스 난바'],
  [['Kiyomizu-dera', '清水寺'], '기요미즈데라'],
  [['Fushimi Inari Taisha', '伏見稲荷大社'], '후시미 이나리 타이샤'],
  [['Kinkaku-ji', '金閣寺'], '킨카쿠지'],
];
const names = new Map(nameEntries.flatMap(([aliases, korean]) => aliases.map(alias => [key(alias), korean] as const)));
const addressEntries: [string[], string][] = [
  [['Japan', '日本'], '일본'], [['South Korea', 'Republic of Korea', '대한민국'], '대한민국'],
  [['Osaka Prefecture', '大阪府'], '오사카부'], [['Osaka', '大阪市'], '오사카'],
  [['Kyoto Prefecture', '京都府'], '교토부'], [['Kyoto', '京都市'], '교토'],
  [['Hyogo Prefecture', '兵庫県'], '효고현'], [['Tokyo', '東京都'], '도쿄'],
  [['Fukuoka Prefecture', '福岡県'], '후쿠오카현'], [['Fukuoka', '福岡市'], '후쿠오카'],
  [['Nara Prefecture', '奈良県'], '나라현'], [['Nara', '奈良市'], '나라'],
  [['Itami', '伊丹市'], '이타미'], [['Izumisano', '泉佐野市'], '이즈미사노'],
  [['Tottori Prefecture', '鳥取県'], '돗토리현'], [['Yonago', '米子市'], '요나고'], [['Sakaiminato', '境港市'], '사카이미나토'],
  [['Kobe', '神戸市'], '고베'], [['Suita', '吹田市'], '스이타'], [['Toyonaka', '豊中市'], '도요나카'],
  [['Moriguchi', '守口市'], '모리구치'], [['Higashiosaka', '東大阪市'], '히가시오사카'],
  [['Chuo Ward', '中央区'], '주오구'], [['Kita Ward', '北区'], '기타구'],
  [['Miyakojima Ward', '都島区'], '미야코지마구'], [['Tennoji Ward', '天王寺区'], '덴노지구'],
  [['Abeno Ward', '阿倍野区'], '아베노구'], [['Ikuno Ward', '生野区'], '이쿠노구'],
  [['Higashinari Ward', '東成区'], '히가시나리구'], [['Namba', 'Nanba', '難波'], '난바'],
  [['Nanba-Sennichimae', '難波千日前'], '난바센니치마에'], [['Soemoncho', '宗右衛門町'], '소에몬초'],
  [['Umeda', '梅田'], '우메다'], [['Daejeon', '대전광역시'], '대전'], [['Seoul'], '서울'], [['Busan'], '부산'],
];
const addresses = new Map(addressEntries.flatMap(([aliases, korean]) => aliases.map(alias => [key(alias), korean] as const)));
const hangul = /[가-힣]/;
export const textProperty = (properties: Record<string, unknown>, field: string): string => typeof properties[field] === 'string' ? properties[field].trim() : '';

function koreanProperty(properties: Record<string, unknown>, fields: string[]): string | undefined {
  const sources = [properties, properties.namedetails, properties.extra].filter((value): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value));
  for (const source of sources) for (const field of fields) {
    const text = textProperty(source, field);
    if (hangul.test(text)) return text;
  }
}

/** Only use supplied translations or known exact names; retain unknown names. */
export function localizePlace(properties: Record<string, unknown>, fallback: string) {
  const rawName = textProperty(properties, 'name') || textProperty(properties, 'street') || fallback;
  const name = koreanProperty(properties, ['name:ko', 'name_ko'])
    || (textProperty(properties, 'osm_value') === 'aerodrome' ? koreanAirportName(rawName) : undefined)
    || names.get(key(rawName)) || addresses.get(key(rawName)) || rawName;
  const parts = ['country', 'state', 'county', 'city', 'district', 'locality', 'street', 'housenumber', 'postcode'].map(field => textProperty(properties, field)).filter(Boolean);
  const rawAddress = [...new Set(parts)].join(' ');
  const address = koreanProperty(properties, ['address:ko', 'address_ko']) || [...new Set(parts.map(part => addresses.get(key(part)) || part))].join(' ');
  return {
    name,
    originalName: name !== rawName ? rawName : undefined,
    nameLocalized: hangul.test(name),
    address,
    originalAddress: address !== rawAddress && rawAddress ? rawAddress : undefined,
  };
}
