// src/lib/geo/cities_kr_jp.ts
export type CountryCode = "KR" | "JP";

export type City = {
  id: string;
  countryCode: CountryCode;
  nameKo: string;
  nameEn: string;
  admin1: string; // 도/현/주
  lat: number;
  lng: number;
  aliases: string[]; // 검색용 별칭(한/영/약칭)
};

const KR: City[] = [
  {
    id: "KR-SEOUL",
    countryCode: "KR",
    nameKo: "서울",
    nameEn: "Seoul",
    admin1: "서울특별시",
    lat: 37.5665,
    lng: 126.978,
    aliases: ["서울", "seoul", "서울시", "수도권"],
  },
  {
    id: "KR-BUSAN",
    countryCode: "KR",
    nameKo: "부산",
    nameEn: "Busan",
    admin1: "부산광역시",
    lat: 35.1796,
    lng: 129.0756,
    aliases: ["부산", "busan", "부산시"],
  },
  {
    id: "KR-JEJU",
    countryCode: "KR",
    nameKo: "제주",
    nameEn: "Jeju",
    admin1: "제주특별자치도",
    lat: 33.4996,
    lng: 126.5312,
    aliases: ["제주", "jeju", "제주도", "제주특별자치도"],
  },
  {
    id: "KR-INCHEON",
    countryCode: "KR",
    nameKo: "인천",
    nameEn: "Incheon",
    admin1: "인천광역시",
    lat: 37.4563,
    lng: 126.7052,
    aliases: ["인천", "incheon", "인천시"],
  },
  {
    id: "KR-DAEGU",
    countryCode: "KR",
    nameKo: "대구",
    nameEn: "Daegu",
    admin1: "대구광역시",
    lat: 35.8714,
    lng: 128.6014,
    aliases: ["대구", "daegu", "대구시"],
  },
  {
    id: "KR-DAEJEON",
    countryCode: "KR",
    nameKo: "대전",
    nameEn: "Daejeon",
    admin1: "대전광역시",
    lat: 36.3504,
    lng: 127.3845,
    aliases: ["대전", "daejeon", "대전시"],
  },
  {
    id: "KR-GWANGJU",
    countryCode: "KR",
    nameKo: "광주",
    nameEn: "Gwangju",
    admin1: "광주광역시",
    lat: 35.1595,
    lng: 126.8526,
    aliases: ["광주", "gwangju", "광주시"],
  },
  {
    id: "KR-ULSAN",
    countryCode: "KR",
    nameKo: "울산",
    nameEn: "Ulsan",
    admin1: "울산광역시",
    lat: 35.5384,
    lng: 129.3114,
    aliases: ["울산", "ulsan", "울산시"],
  },
  {
    id: "KR-SUWON",
    countryCode: "KR",
    nameKo: "수원",
    nameEn: "Suwon",
    admin1: "경기도",
    lat: 37.2636,
    lng: 127.0286,
    aliases: ["수원", "suwon", "경기", "경기도"],
  },
  {
    id: "KR-GANGNEUNG",
    countryCode: "KR",
    nameKo: "강릉",
    nameEn: "Gangneung",
    admin1: "강원특별자치도",
    lat: 37.7519,
    lng: 128.8761,
    aliases: ["강릉", "gangneung", "강원", "강원도"],
  },
  {
    id: "KR-GYEONGJU",
    countryCode: "KR",
    nameKo: "경주",
    nameEn: "Gyeongju",
    admin1: "경상북도",
    lat: 35.8562,
    lng: 129.2247,
    aliases: ["경주", "gyeongju", "경북", "경상북도"],
  },
  {
    id: "KR-JEONJU",
    countryCode: "KR",
    nameKo: "전주",
    nameEn: "Jeonju",
    admin1: "전북특별자치도",
    lat: 35.8242,
    lng: 127.148,
    aliases: ["전주", "jeonju", "전북", "전라북도"],
  },
];

const JP: City[] = [
  {
    id: "JP-TOKYO",
    countryCode: "JP",
    nameKo: "도쿄",
    nameEn: "Tokyo",
    admin1: "Tokyo",
    lat: 35.6762,
    lng: 139.6503,
    aliases: ["도쿄", "tokyo", "東京"],
  },
  {
    id: "JP-OSAKA",
    countryCode: "JP",
    nameKo: "오사카",
    nameEn: "Osaka",
    admin1: "Osaka",
    lat: 34.6937,
    lng: 135.5023,
    aliases: ["오사카", "osaka", "大阪"],
  },
  {
    id: "JP-KYOTO",
    countryCode: "JP",
    nameKo: "교토",
    nameEn: "Kyoto",
    admin1: "Kyoto",
    lat: 35.0116,
    lng: 135.7681,
    aliases: ["교토", "kyoto", "京都"],
  },
  {
    id: "JP-FUKUOKA",
    countryCode: "JP",
    nameKo: "후쿠오카",
    nameEn: "Fukuoka",
    admin1: "Fukuoka",
    lat: 33.5904,
    lng: 130.4017,
    aliases: ["후쿠오카", "fukuoka", "福岡"],
  },
  {
    id: "JP-SAPPORO",
    countryCode: "JP",
    nameKo: "삿포로",
    nameEn: "Sapporo",
    admin1: "Hokkaido",
    lat: 43.0618,
    lng: 141.3545,
    aliases: ["삿포로", "sapporo", "札幌", "홋카이도", "hokkaido"],
  },
  {
    id: "JP-NAGOYA",
    countryCode: "JP",
    nameKo: "나고야",
    nameEn: "Nagoya",
    admin1: "Aichi",
    lat: 35.1815,
    lng: 136.9066,
    aliases: ["나고야", "nagoya", "名古屋", "aichi"],
  },
  {
    id: "JP-OKINAWA",
    countryCode: "JP",
    nameKo: "오키나와(나하)",
    nameEn: "Okinawa (Naha)",
    admin1: "Okinawa",
    lat: 26.2124,
    lng: 127.6809,
    aliases: ["오키나와", "okinawa", "나하", "naha", "沖縄"],
  },
  {
    id: "JP-KOBE",
    countryCode: "JP",
    nameKo: "고베",
    nameEn: "Kobe",
    admin1: "Hyogo",
    lat: 34.6901,
    lng: 135.1955,
    aliases: ["고베", "kobe", "神戸", "hyogo", "효고"],
  },
  {
    id: "JP-HIROSHIMA",
    countryCode: "JP",
    nameKo: "히로시마",
    nameEn: "Hiroshima",
    admin1: "Hiroshima",
    lat: 34.3853,
    lng: 132.4553,
    aliases: ["히로시마", "hiroshima", "広島"],
  },
];

export const CITIES: City[] = [...KR, ...JP];

export function normalizeQuery(s: string) {
  return s.toLowerCase().replaceAll(" ", "").replaceAll("-", "").trim();
}

export function searchCities(countryCode: CountryCode, query: string, limit = 8) {
  const q = normalizeQuery(query);
  if (!q) return [];
  const list = CITIES.filter((c) => c.countryCode === countryCode);

  const scored = list
    .map((c) => {
      const hay = [c.nameKo, c.nameEn, c.admin1, ...c.aliases].map(normalizeQuery);
      const hitIdx = hay.reduce((best, t) => {
        const idx = t.indexOf(q);
        if (idx === -1) return best;
        return Math.min(best, idx);
      }, Number.POSITIVE_INFINITY);
      return { c, hitIdx };
    })
    .filter((x) => Number.isFinite(x.hitIdx))
    .sort((a, b) => a.hitIdx - b.hitIdx);

  return scored.slice(0, limit).map((x) => x.c);
}
