type AirportAlias = { names: string[]; query: string; label: string };
const airports: AirportAlias[] = [
  { names: ['요나고공항', '요나고기타로공항', '요나고키타로공항', '미호공항', 'Yonago Kitaro Airport', 'Miho-Yonago Airport', 'Miho Airport', 'Miho Airbase', '米子空港', '米子鬼太郎空港', '美保飛行場', 'YGJ'], query: 'Yonago Airport', label: '요나고 기타로 공항' },
  { names: ['오사카공항', '오사카국제공항', '오사카이타미공항', '이타미공항', '이타미국제공항', 'Osaka Itami Airport', '大阪国際空港', 'ITM'], query: 'Osaka International Airport', label: '오사카 국제공항(이타미)' },
  { names: ['간사이공항', '간사이국제공항', '칸사이공항', '칸사이국제공항', '関西国際空港', 'KIX'], query: 'Kansai International Airport', label: '간사이 국제공항' },
  { names: ['하네다공항', '도쿄하네다공항', 'HND'], query: 'Haneda Airport', label: '하네다 공항' },
  { names: ['나리타공항', '나리타국제공항', 'NRT'], query: 'Narita International Airport', label: '나리타 국제공항' },
  { names: ['후쿠오카공항', 'FUK'], query: 'Fukuoka Airport', label: '후쿠오카 공항' },
  { names: ['신치토세공항', '신치토세국제공항', 'CTS'], query: 'New Chitose Airport', label: '신치토세 공항' },
];
const compact = (text: string) => text.normalize('NFKC').replace(/[\s()（）·-]/g, '').toLocaleLowerCase();
export function koreanAirportName(name: string): string | undefined {
  return airports.find(entry => [...entry.names, entry.query].some(alias => compact(alias) === compact(name)))?.label;
}
const travelTerms: [string, string][] = [
  ['오사카성', 'Osaka Castle'], ['도톤보리', 'Dotonbori'], ['구로몬시장', 'Kuromon Market'],
  ['오사카', 'Osaka'], ['도쿄', 'Tokyo'], ['교토', 'Kyoto'], ['후쿠오카', 'Fukuoka'], ['삿포로', 'Sapporo'], ['나고야', 'Nagoya'], ['난바', 'Namba'], ['우메다', 'Umeda'],
  ['요나고', 'Yonago'],
  ['국제공항', 'International Airport'], ['공항', 'Airport'],
];
export function resolveSearchQuery(input: string) {
  const original = input.trim().replace(/\s+/g, ' ');
  const name = compact(original);
  const airport = airports.find(entry => [...entry.names, entry.query].some(alias => compact(alias) === name));
  const exactTerm = travelTerms.find(([term]) => compact(term) === name)?.[1];
  let text = airport?.query ?? exactTerm ?? original;
  if (!airport && !exactTerm) for (const [term, replacement] of travelTerms) text = text.replaceAll(term, ` ${replacement} `);
  text = text.trim().replace(/\s+/g, ' ');
  const osakaAirport = /^(오사카(국제)?공항|osaka(international)?airport)$/i.test(name);
  return {
    text,
    expanded: text !== original,
    airport: !!airport || /공항$|airport$/i.test(original),
    label: airport?.label,
    alternatives: osakaAirport ? ['이타미 공항', '간사이 공항'] : [],
  };
}
