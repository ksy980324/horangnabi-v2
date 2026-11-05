export type DestinationCity = { countryCode: string; name: string; englishName: string; aliases: string[]; popular: boolean };
const codes = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const names = new Intl.DisplayNames(['ko'], { type: 'region' });
const countryOverrides: Record<string, string> = { KR: '대한민국', US: '미국', GB: '영국', HK: '홍콩', MO: '마카오', TW: '대만', AU: '호주' };
export const countries = codes.map(code => ({ code, name: countryOverrides[code] || names.of(code) || code })).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
export const popularCountryCodes = ['JP', 'KR', 'TW', 'VN', 'TH', 'SG', 'CN', 'PH', 'ID', 'MY', 'US', 'FR', 'IT', 'ES', 'GB', 'AU'];
// A small offline starter, supplemented by explicit country-filtered city search.
// Entries are destinations, including towns, islands and travel regions.
const cityData: Record<string, string[]> = {
  JP: ['도쿄|Tokyo|東京', '오사카|Osaka|大阪', '후쿠오카|Fukuoka|福岡', '교토|Kyoto|京都', '삿포로|Sapporo|札幌', '오키나와|Okinawa|沖縄', '나고야|Nagoya|名古屋', '고베|Kobe|神戸', '요코하마|Yokohama|横浜', '나라|Nara|奈良', '요나고|Yonago|米子', '돗토리|Tottori|鳥取', '마쓰에|Matsue|松江', '이즈모|Izumo|出雲', '다카마쓰|Takamatsu|高松', '마쓰야마|Matsuyama|松山', '고치|Kochi|高知', '도쿠시마|Tokushima|徳島', '히로시마|Hiroshima|広島', '오카야마|Okayama|岡山', '구라시키|Kurashiki|倉敷', '오노미치|Onomichi|尾道', '나오시마|Naoshima|直島', '쇼도시마|Shodoshima|小豆島', '가나자와|Kanazawa|金沢', '도야마|Toyama|富山', '다카야마|Takayama|高山', '시라카와고|Shirakawa-go|白川郷', '게로|Gero|下呂', '마쓰모토|Matsumoto|松本', '나가노|Nagano|長野', '가루이자와|Karuizawa|軽井沢', '하코네|Hakone|箱根', '가와구치코|Fujikawaguchiko|河口湖', '가마쿠라|Kamakura|鎌倉', '에노시마|Enoshima|江の島', '닛코|Nikko|日光', '가와고에|Kawagoe|川越', '아타미|Atami|熱海', '시즈오카|Shizuoka|静岡', '하마마쓰|Hamamatsu|浜松', '이세|Ise|伊勢', '와카야마|Wakayama|和歌山', '시라하마|Shirahama|白浜', '기노사키 온천|Kinosaki Onsen|城崎温泉', '아마노하시다테|Amanohashidate|天橋立', '우지|Uji|宇治', '히메지|Himeji|姫路', '벳푸|Beppu|別府', '유후인|Yufuin|由布院|湯布院', '오이타|Oita|大分', '구마모토|Kumamoto|熊本', '아소|Aso|阿蘇', '나가사키|Nagasaki|長崎', '사가|Saga|佐賀', '사세보|Sasebo|佐世保', '가고시마|Kagoshima|鹿児島', '미야자키|Miyazaki|宮崎', '기타큐슈|Kitakyushu|北九州', '시모노세키|Shimonoseki|下関', '하코다테|Hakodate|函館', '오타루|Otaru|小樽', '아사히카와|Asahikawa|旭川', '후라노|Furano|富良野', '비에이|Biei|美瑛', '노보리베쓰|Noboribetsu|登別', '아오모리|Aomori|青森', '센다이|Sendai|仙台', '아키타|Akita|秋田', '모리오카|Morioka|盛岡', '야마가타|Yamagata|山形', '니가타|Niigata|新潟', '나하|Naha|那覇', '이시가키|Ishigaki|石垣', '미야코지마|Miyakojima|宮古島'],
  KR: ['서울|Seoul', '부산|Busan', '제주|Jeju', '강릉|Gangneung', '경주|Gyeongju', '전주|Jeonju', '속초|Sokcho', '여수|Yeosu', '순천|Suncheon', '통영|Tongyeong', '거제|Geoje', '남해|Namhae', '안동|Andong', '공주|Gongju', '부여|Buyeo', '단양|Danyang', '영월|Yeongwol', '담양|Damyang', '구례|Gurye', '하동|Hadong', '보성|Boseong', '고성|Goseong', '양양|Yangyang', '춘천|Chuncheon', '인천|Incheon', '대전|Daejeon', '대구|Daegu', '광주|Gwangju', '울산|Ulsan', '수원|Suwon', '포항|Pohang', '목포|Mokpo', '군산|Gunsan', '울릉도|Ulleungdo'],
  TW: ['타이베이|Taipei|臺北', '가오슝|Kaohsiung|高雄', '타이중|Taichung|臺中', '타이난|Tainan|臺南', '화롄|Hualien|花蓮', '타이둥|Taitung|臺東', '지우펀|Jiufen|九份', '단수이|Tamsui|淡水', '이란|Yilan|宜蘭', '헝춘|Hengchun|恆春'],
  VN: ['다낭|Da Nang', '하노이|Hanoi', '호찌민|Ho Chi Minh City|호치민', '나트랑|Nha Trang', '푸꾸옥|Phu Quoc', '호이안|Hoi An', '달랏|Da Lat', '사파|Sa Pa', '닌빈|Ninh Binh', '후에|Hue', '꾸이년|Quy Nhon', '무이네|Mui Ne'],
  TH: ['방콕|Bangkok', '치앙마이|Chiang Mai', '푸껫|Phuket|푸켓', '파타야|Pattaya', '끄라비|Krabi', '코사무이|Ko Samui', '치앙라이|Chiang Rai', '빠이|Pai', '후아힌|Hua Hin', '아유타야|Ayutthaya', '수코타이|Sukhothai'],
  CN: ['상하이|Shanghai|上海', '베이징|Beijing|北京', '칭다오|Qingdao|青岛', '광저우|Guangzhou|广州', '청두|Chengdu|成都', '시안|Xian|西安', '항저우|Hangzhou|杭州', '쑤저우|Suzhou|苏州', '샤먼|Xiamen|厦门', '리장|Lijiang|丽江', '다리|Dali|大理'],
  HK: ['홍콩|Hong Kong|香港'], MO: ['마카오|Macau|澳門'], SG: ['싱가포르|Singapore'],
  MY: ['쿠알라룸푸르|Kuala Lumpur', '코타키나발루|Kota Kinabalu', '조지타운|George Town', '말라카|Malacca', '이포|Ipoh', '랑카위|Langkawi'],
  ID: ['발리|Bali', '자카르타|Jakarta', '우붓|Ubud', '족자카르타|Yogyakarta', '롬복|Lombok'],
  PH: ['세부|Cebu', '마닐라|Manila', '보라카이|Boracay', '보홀|Bohol', '엘니도|El Nido', '푸에르토프린세사|Puerto Princesa'],
  LA: ['루앙프라방|Luang Prabang', '비엔티안|Vientiane', '방비엥|Vang Vieng'], KH: ['시엠레아프|Siem Reap', '프놈펜|Phnom Penh', '캄폿|Kampot'],
  MN: ['울란바토르|Ulaanbaatar', '하르호린|Kharkhorin'],
  US: ['뉴욕|New York', '로스앤젤레스|Los Angeles', '샌프란시스코|San Francisco', '라스베이거스|Las Vegas', '호놀룰루|Honolulu', '시애틀|Seattle', '샌디에이고|San Diego', '보스턴|Boston', '시카고|Chicago', '워싱턴 D.C.|Washington DC', '포틀랜드|Portland', '세도나|Sedona', '몬터레이|Monterey', '산타바버라|Santa Barbara'],
  CA: ['밴쿠버|Vancouver', '토론토|Toronto', '몬트리올|Montreal', '퀘벡|Quebec City', '밴프|Banff', '빅토리아|Victoria', '휘슬러|Whistler'],
  FR: ['파리|Paris', '니스|Nice', '리옹|Lyon', '마르세유|Marseille', '보르도|Bordeaux', '스트라스부르|Strasbourg', '콜마르|Colmar', '안시|Annecy', '아비뇽|Avignon', '아를|Arles'],
  IT: ['로마|Rome|Roma', '피렌체|Florence|Firenze', '베네치아|Venice|Venezia', '밀라노|Milan|Milano', '나폴리|Naples|Napoli', '볼로냐|Bologna', '베로나|Verona', '시에나|Siena', '루카|Lucca', '오르비에토|Orvieto', '포지타노|Positano', '아말피|Amalfi', '마테라|Matera'],
  ES: ['바르셀로나|Barcelona', '마드리드|Madrid', '세비야|Seville|Sevilla', '그라나다|Granada', '발렌시아|Valencia', '말라가|Malaga', '론다|Ronda', '톨레도|Toledo', '코르도바|Cordoba'],
  PT: ['리스본|Lisbon|Lisboa', '포르투|Porto', '신트라|Sintra', '오비두스|Obidos', '라구스|Lagos'],
  GB: ['런던|London', '에든버러|Edinburgh', '맨체스터|Manchester', '옥스퍼드|Oxford', '케임브리지|Cambridge', '배스|Bath', '요크|York', '인버네스|Inverness'],
  DE: ['베를린|Berlin', '뮌헨|Munich|Munchen', '프랑크푸르트|Frankfurt', '함부르크|Hamburg', '쾰른|Cologne|Koln', '하이델베르크|Heidelberg', '로텐부르크|Rothenburg ob der Tauber', '밤베르크|Bamberg', '퓌센|Fussen'],
  CH: ['취리히|Zurich', '인터라켄|Interlaken', '루체른|Lucerne|Luzern', '제네바|Geneva', '체르마트|Zermatt', '그린델발트|Grindelwald', '라우터브루넨|Lauterbrunnen'],
  AT: ['빈|Vienna|Wien', '잘츠부르크|Salzburg', '인스브루크|Innsbruck', '할슈타트|Hallstatt'],
  CZ: ['프라하|Prague|Praha', '체스키크룸로프|Cesky Krumlov', '카를로비바리|Karlovy Vary', '브르노|Brno'],
  HU: ['부다페스트|Budapest', '센텐드레|Szentendre'], NL: ['암스테르담|Amsterdam', '로테르담|Rotterdam', '델프트|Delft', '위트레흐트|Utrecht'],
  BE: ['브뤼셀|Brussels', '브뤼헤|Bruges', '헨트|Ghent'], GR: ['아테네|Athens', '산토리니|Santorini', '미코노스|Mykonos', '나플리오|Nafplio'],
  HR: ['두브로브니크|Dubrovnik', '스플리트|Split', '자그레브|Zagreb', '로빈|Rovinj'], TR: ['이스탄불|Istanbul', '안탈리아|Antalya', '괴레메|Goreme', '셀추크|Selcuk'],
  AU: ['시드니|Sydney', '멜버른|Melbourne', '브리즈번|Brisbane', '골드코스트|Gold Coast', '퍼스|Perth', '케언스|Cairns', '호바트|Hobart', '바이런베이|Byron Bay'],
  NZ: ['오클랜드|Auckland', '퀸스타운|Queenstown', '크라이스트처치|Christchurch', '로토루아|Rotorua', '와나카|Wanaka', '테아나우|Te Anau'],
  IS: ['레이캬비크|Reykjavik', '아퀴레이리|Akureyri', '비크|Vik'], NO: ['오슬로|Oslo', '베르겐|Bergen', '트롬쇠|Tromso'],
  FI: ['헬싱키|Helsinki', '로바니에미|Rovaniemi', '포르보|Porvoo'], SE: ['스톡홀름|Stockholm', '예테보리|Gothenburg'], DK: ['코펜하겐|Copenhagen', '오르후스|Aarhus'],
  AE: ['두바이|Dubai', '아부다비|Abu Dhabi'], IN: ['뉴델리|New Delhi', '뭄바이|Mumbai', '자이푸르|Jaipur', '아그라|Agra', '바라나시|Varanasi'],
  NP: ['카트만두|Kathmandu', '포카라|Pokhara', '박타푸르|Bhaktapur'], LK: ['콜롬보|Colombo', '캔디|Kandy', '갈레|Galle'],
  MX: ['멕시코시티|Mexico City', '칸쿤|Cancun', '과나후아토|Guanajuato', '오아하카|Oaxaca'], PE: ['리마|Lima', '쿠스코|Cusco', '아레키파|Arequipa'],
  BR: ['리우데자네이루|Rio de Janeiro', '상파울루|Sao Paulo'], AR: ['부에노스아이레스|Buenos Aires', '엘칼라파테|El Calafate'],
  EG: ['카이로|Cairo', '룩소르|Luxor', '아스완|Aswan'], MA: ['마라케시|Marrakesh', '페스|Fes', '셰프샤우엔|Chefchaouen'], ZA: ['케이프타운|Cape Town', '요하네스버그|Johannesburg'],
};
export const cities: DestinationCity[] = Object.entries(cityData).flatMap(([countryCode, entries]) => entries.map((entry, index) => {
  const [name, englishName, ...aliases] = entry.split('|');
  return { countryCode, name, englishName, aliases, popular: index < 6 };
}));
const normalize = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f\s·.,'-]/g, '').toLocaleLowerCase();
export function filterCities(countryCode: string, query: string): DestinationCity[] {
  const value = normalize(query);
  return cities.filter(city => city.countryCode === countryCode && [city.name, city.englishName, ...city.aliases].some(name => normalize(name).includes(value)));
}
export function citySearchQuery(countryCode: string, query: string): string {
  return filterCities(countryCode, query).find(city => [city.name, city.englishName, ...city.aliases].some(name => normalize(name) === normalize(query)))?.englishName ?? query;
}
export function parseDestination(region: string) {
  const [countryName, ...rest] = region.split(' · ');
  const country = countries.find(country => country.name === countryName || (country.code === 'KR' && countryName === '한국'));
  return country && rest.length ? { countryCode: country.code, cityName: rest.join(' · '), manual: false } : { countryCode: '', cityName: '', manual: !!region };
}
