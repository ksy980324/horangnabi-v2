import type { GeoPoint } from './geo.ts';

// Airport reference points from the OurAirports public-domain dataset.
const airports: Record<string, { names: string[]; point: GeoPoint }> = {
  ICN: { names: ['인천공항', '인천국제공항', 'Incheon International Airport'], point: { lat: 37.469101, lng: 126.450996 } },
  GMP: { names: ['김포공항', '김포국제공항'], point: { lat: 37.5583, lng: 126.791 } },
  PUS: { names: ['김해공항', '김해국제공항'], point: { lat: 35.179501, lng: 128.938004 } },
  YGJ: { names: ['요나고', '요나고공항', '요나고기타로공항', '요나고키타로공항', 'Yonago Airport', '米子鬼太郎空港'], point: { lat: 35.492199, lng: 133.235992 } },
  KIX: { names: ['간사이공항', '간사이국제공항', '오사카간사이공항'], point: { lat: 34.427299, lng: 135.244003 } },
  NRT: { names: ['나리타공항', '나리타국제공항'], point: { lat: 35.76858, lng: 140.388714 } },
  HND: { names: ['하네다공항', '도쿄하네다공항'], point: { lat: 35.549678, lng: 139.786958 } },
  FUK: { names: ['후쿠오카공항'], point: { lat: 33.585899, lng: 130.451004 } },
  CTS: { names: ['신치토세공항', '삿포로신치토세공항'], point: { lat: 42.774753, lng: 141.690414 } },
  NGO: { names: ['주부국제공항', '나고야주부공항'], point: { lat: 34.858398, lng: 136.804993 } },
  OKA: { names: ['나하공항', '오키나와나하공항'], point: { lat: 26.192437, lng: 127.639804 } },
  TAK: { names: ['다카마쓰공항', '다카마츠공항'], point: { lat: 34.214963, lng: 134.015454 } },
};

const normalize = (value: string) => value.normalize('NFKC').toUpperCase().replace(/\s+/g, '');
export function airportCoordinates(airport: string): GeoPoint | undefined {
  const name = normalize(airport);
  const code = name.match(/(?:^|\()([A-Z]{3})(?:\)|$)$/)?.[1];
  if (code) return airports[code]?.point;
  return Object.values(airports).find(entry => entry.names.some(alias => normalize(alias) === name))?.point;
}
