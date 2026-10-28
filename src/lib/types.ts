export type RaceId =
  | "taipei" | "new-taipei" | "taoyuan" | "taichung" | "tainan" | "kaohsiung"
  | "keelung" | "hsinchu-city" | "hsinchu-county" | "miaoli" | "changhua" | "nantou"
  | "yunlin" | "chiayi-city" | "chiayi-county" | "pingtung" | "yilan" | "hualien"
  | "taitung" | "penghu" | "kinmen" | "lienchiang" | "zhubei";

export type Party = "kmt" | "dpp" | "tpp" | "npp" | "pfp" | "tsp" | "ind" | "other";

export type Tier = "metro" | "county" | "township";

export interface RaceMeta { id: RaceId; name: string; short: string; tier: Tier; region: Region }

export type Region = "north" | "central" | "south" | "east" | "islands";

export const RACES: RaceMeta[] = [
  { id: "taipei", name: "台北市", short: "台北", tier: "metro", region: "north" },
  { id: "new-taipei", name: "新北市", short: "新北", tier: "metro", region: "north" },
  { id: "keelung", name: "基隆市", short: "基隆", tier: "county", region: "north" },
  { id: "taoyuan", name: "桃園市", short: "桃園", tier: "metro", region: "north" },
  { id: "hsinchu-city", name: "新竹市", short: "竹市", tier: "county", region: "north" },
  { id: "hsinchu-county", name: "新竹縣", short: "竹縣", tier: "county", region: "north" },
  { id: "zhubei", name: "竹北市", short: "竹北", tier: "township", region: "north" },
  { id: "yilan", name: "宜蘭縣", short: "宜蘭", tier: "county", region: "east" },
  { id: "miaoli", name: "苗栗縣", short: "苗栗", tier: "county", region: "central" },
  { id: "taichung", name: "台中市", short: "台中", tier: "metro", region: "central" },
  { id: "changhua", name: "彰化縣", short: "彰化", tier: "county", region: "central" },
  { id: "nantou", name: "南投縣", short: "南投", tier: "county", region: "central" },
  { id: "yunlin", name: "雲林縣", short: "雲林", tier: "county", region: "central" },
  { id: "chiayi-city", name: "嘉義市", short: "嘉市", tier: "county", region: "south" },
  { id: "chiayi-county", name: "嘉義縣", short: "嘉縣", tier: "county", region: "south" },
  { id: "tainan", name: "台南市", short: "台南", tier: "metro", region: "south" },
  { id: "kaohsiung", name: "高雄市", short: "高雄", tier: "metro", region: "south" },
  { id: "pingtung", name: "屏東縣", short: "屏東", tier: "county", region: "south" },
  { id: "hualien", name: "花蓮縣", short: "花蓮", tier: "county", region: "east" },
  { id: "taitung", name: "台東縣", short: "台東", tier: "county", region: "east" },
  { id: "penghu", name: "澎湖縣", short: "澎湖", tier: "county", region: "islands" },
  { id: "kinmen", name: "金門縣", short: "金門", tier: "county", region: "islands" },
  { id: "lienchiang", name: "連江縣", short: "連江", tier: "county", region: "islands" },
];

export const RACE_BY_ID = Object.fromEntries(RACES.map((r) => [r.id, r])) as Record<RaceId, RaceMeta>;

export const PARTY_NAME: Record<Party, string> = {
  kmt: "國民黨", dpp: "民進黨", tpp: "民眾黨", npp: "時代力量", pfp: "親民黨",
  tsp: "台灣基進", ind: "無黨籍", other: "其他",
};
