import type { WorldRegion } from '../types/worldAtlas';

/**
 * Seed World Atlas regions — a NEW reference layer over the canonical world.
 *
 * These do NOT replace campaign locations. Where a region corresponds to an
 * existing campaign location it links via `linkedLocationIds` (opaque ids,
 * read-only). Nothing here mutates Arc 1 / Arc 2 data.
 */
export const WORLD_REGIONS: WorldRegion[] = [
  // ── Known World root ────────────────────────────────────────────────
  {
    id: 'region-known-world',
    title: 'Known World',
    titleRu: 'Известный мир',
    type: 'world',
    canonStatus: 'fixedCanon',
    mapId: 'atlas-map-known-world',
    linkedMapIds: ['atlas-map-known-world'],
    shortDescription: 'Область надёжного знания. За её пределами — Неведомый Предел.',
    dmDescription:
      'Известный мир — это не изученная планета, а область надёжного знания: дороги, морские маршруты, карты и языки. Карта показывает не границы мира, а границы уверенности. Ориентация канона: север снизу, юг сверху.',
    playerDescription:
      'Мир, каким его знают жители Ауролеона, Кальдрана, Талассии и пограничных земель. Дальше карт лежат моря, пустоши и земли, откуда не возвращаются.',
    visualTone: 'Старинная карта, тёмное фэнтези, граница уверенности.',
    themes: ['граница знания', 'экспедиции', 'неизвестность'],
    linkedAdventureModuleIds: [],
    playerSafe: true,
  },

  // ── Aurelon ─────────────────────────────────────────────────────────
  {
    id: 'region-aurelon',
    title: 'Aurelon',
    titleRu: 'Ауролеон',
    parentId: 'region-known-world',
    type: 'state',
    canonStatus: 'fixedCanon',
    mapId: 'atlas-map-aurelon',
    linkedMapIds: ['atlas-map-aurelon'],
    shortDescription: 'Держава закона, гражданства и устойчивой системы.',
    dmDescription:
      'Крупное централизованное многорасовое государство граждан, построенное вокруг закона, суда, бюрократии и армии. Принцип: «Прими общий порядок — и твоё место будет защищено». Закон важнее намерений, порядок важнее героизма.',
    playerDescription: 'Держава закона и порядка, где идентичность гражданина выше расы и рода.',
    visualTone: 'Порядок, камень, знамёна, дороги, чиновники.',
    rulingPower: 'Корона Ауролеона и централизованная бюрократия.',
    culture: 'Многорасовое гражданское общество, закон выше личного порыва.',
    factions: ['Корона', 'Судебные округа', 'Армия'],
    themes: ['закон', 'порядок', 'гражданство'],
    playerSafe: true,
  },
  { id: 'region-greyholm-region', title: 'Greyholm Region', titleRu: 'Регион Грейхольма', parentId: 'region-aurelon', type: 'region', canonStatus: 'fixedCanon', mapId: 'atlas-map-greyholm-region', linkedMapIds: ['atlas-map-greyholm-region'], shortDescription: 'Пограничный край Ауролеона у горной дуги Кальдрана.', dmDescription: 'Грейхольмский фронт — приграничный военный край между Ауролеоном и Кальдраном. В основной кампании это арена Арки 1 и Арки 2; в атласе регион показан справочно и не редактирует данные арок.', playerDescription: 'Северный пограничный регион Ауролеона.', visualTone: 'Пограничье, горы, напряжение.', dangers: ['кальдранское давление', 'диверсии'], playerSafe: true },
  { id: 'region-greyholm-city', title: 'Greyholm City', titleRu: 'Город Грейхольм', parentId: 'region-greyholm-region', type: 'city', canonStatus: 'fixedCanon', mapId: 'atlas-map-greyholm-city', linkedMapIds: ['atlas-map-greyholm-city'], shortDescription: 'Приграничный город: гильдии, доки, рынок, стража, магическая коллегия.', dmDescription: 'Город Грейхольм — узел региона. В атласе показан как справочная локация; события Арки 1 и Арки 2 остаются в основной кампании и не затрагиваются one-shot слоем.', playerDescription: 'Оживлённый пограничный город с доками, рынком и гильдиями.', visualTone: 'Городская стена, доки, узкие улицы.', linkedAdventureModuleIds: ['module-greyholm-night'], playerSafe: true },
  { id: 'region-ironreach', title: 'Ironreach', titleRu: 'Айронрич', parentId: 'region-aurelon', type: 'city', canonStatus: 'workingCanon', shortDescription: 'Западный промышленный узел Ауролеона.', dmDescription: 'Портово-промышленный город на западном побережье Ауролеона.', visualTone: 'Кузни, порт, дым.', playerSafe: true },
  { id: 'region-lake-velyra', title: 'Lake Velyra', titleRu: 'Озеро Велира', parentId: 'region-aurelon', type: 'region', canonStatus: 'workingCanon', shortDescription: 'Крупное озеро в сердце Ауролеона.', dmDescription: 'Центральное озеро королевства, вокруг которого сходятся дороги.', playerSafe: true },
  { id: 'region-westport', title: 'Westport', titleRu: 'Вестпорт', parentId: 'region-aurelon', type: 'city', canonStatus: 'workingCanon', shortDescription: 'Западный морской порт.', dmDescription: 'Морские ворота западного побережья Ауролеона.', playerSafe: true },
  { id: 'region-brightford', title: 'Brightford', titleRu: 'Брайтфорд', parentId: 'region-aurelon', type: 'city', canonStatus: 'workingCanon', shortDescription: 'Южный город-переправа.', dmDescription: 'Южный речной город Ауролеона.', playerSafe: true },
  { id: 'region-dunwald', title: 'Dunwald', titleRu: 'Данвальд', parentId: 'region-aurelon', type: 'city', canonStatus: 'workingCanon', shortDescription: 'Восточный лесной город.', dmDescription: 'Восточный город Ауролеона у границы Диких земель.', playerSafe: true },
  { id: 'region-greystone', title: 'Greystone', titleRu: 'Грейстоун', parentId: 'region-aurelon', type: 'city', canonStatus: 'workingCanon', shortDescription: 'Центральный каменный город.', dmDescription: 'Центральный город Ауролеона, узел внутренних дорог.', playerSafe: true },
  { id: 'region-aurelon-sea-gates', title: 'Sea Gates of Aurelon', titleRu: 'Морские ворота Ауролеона', parentId: 'region-aurelon', type: 'sea', canonStatus: 'workingCanon', shortDescription: 'Морские подступы и порты западного побережья.', dmDescription: 'Прибрежная зона портов и морских путей Ауролеона к Аурелианскому морю.', playerSafe: true },

  // ── Caldran ─────────────────────────────────────────────────────────
  {
    id: 'region-caldran',
    title: 'Caldran',
    titleRu: 'Кальдран',
    parentId: 'region-known-world',
    type: 'state',
    canonStatus: 'fixedCanon',
    mapId: 'atlas-map-caldran',
    linkedMapIds: ['atlas-map-caldran'],
    shortDescription: 'Держава Высоких Домов, плато, клятв и доказанного мастерства.',
    dmDescription:
      'Крупная горная держава за верхней дугой Ауролеона. Человека оценивают не по рождению, а по доказанной пользе. Государство домов, клятв, личной верности и профессиональной гордости. Грейхольмский фронт — лишь один пограничный край Кальдрана.',
    playerDescription: 'Суровая горная держава домов и клятв. «Докажи свою ценность — и Кальдран даст тебе дом».',
    visualTone: 'Плато, кузни, чёрный камень, драконьи кряжи.',
    rulingPower: 'Высокие Дома Кальдрана.',
    culture: 'Дома, клятвы, доказанное мастерство, система плена и полезности.',
    dangers: ['виверны', 'суровый плен', 'междоусобицы домов'],
    themes: ['клятвы', 'мастерство', 'полезность'],
    linkedAdventureModuleIds: ['module-salt-mast-war', 'module-salt-ledge-captives', 'module-dragon-ridges-road'],
    playerSafe: true,
  },
  { id: 'region-caldran-high-plateau', title: 'High Plateau', titleRu: 'Высокое Плато', parentId: 'region-caldran', type: 'region', canonStatus: 'fixedCanon', shortDescription: 'Сердце Кальдрана: плато домов, поля и печати.', dmDescription: 'Высокое Плато — центральная область Кальдрана: Чёрные Кавалерийские Поля, Серебряные Поля, Серебряный Каменный Престол, Архив Вороньей Печати.', visualTone: 'Открытое плато, знамёна домов.', playerSafe: true },
  { id: 'region-caldran-stone-terraces', title: 'Stone Terraces', titleRu: 'Каменные Террасы', parentId: 'region-caldran', type: 'region', canonStatus: 'fixedCanon', shortDescription: 'Ступенчатые склоны, Террасные врата, Скаар Вейлхаус.', dmDescription: 'Каменные Террасы спускаются от плато: Террасные врата, Вел-Кар марш, Скаар Вейлхаус.', visualTone: 'Ступени, серпантины, туман.', playerSafe: true },
  { id: 'region-caldran-forge-valleys', title: 'Forge Valleys', titleRu: 'Кузнечные Долины', parentId: 'region-caldran', type: 'region', canonStatus: 'fixedCanon', shortDescription: 'Долины кузен, литейных пределов и тихих молотовых залов.', dmDescription: 'Кузнечные Долины: Тихие Молотовые Залы, Литейни Каменного Предела, Железные Кабаньи Дворы. Сердце ремесла Кальдрана.', visualTone: 'Дым, огонь горнов, железо.', resources: ['железо', 'сталь', 'оружие'], playerSafe: true },
  { id: 'region-caldran-salt-ledge', title: 'Salt Ledge', titleRu: 'Солёный Уступ', parentId: 'region-caldran', type: 'region', canonStatus: 'fixedCanon', shortDescription: 'Морская окраина Кальдрана: Солёные Гавани и Талассийский маршрут.', dmDescription: 'Солёный Уступ — морской край Кальдрана у External Ocean. Солёные Гавани (Saltrock Havens), выход на Талассийский маршрут. Место старой морской войны с Талассией и системы плена.', visualTone: 'Солёные скалы, гавани, штормовое море.', dangers: ['морские набеги', 'плен'], linkedAdventureModuleIds: ['module-salt-mast-war', 'module-salt-ledge-captives'], playerSafe: true },
  { id: 'region-caldran-dragon-ridges', title: 'Dragon Ridges', titleRu: 'Драконьи Кряжи', parentId: 'region-caldran', type: 'wilderness', canonStatus: 'fixedCanon', shortDescription: 'Земли виверн, старых договоров и Дома Крылатой Кости.', dmDescription: 'Драконьи Кряжи: Крылокостные Утёсы (Wingbone Crags), Камни Старого Змеиного Договора. Земли виверн и охотников Дома Крылатой Кости.', visualTone: 'Острые пики, тени крыльев.', dangers: ['виверны', 'нарушение договоров'], linkedAdventureModuleIds: ['module-dragon-ridges-road'], playerSafe: true },
  { id: 'region-caldran-lower-wilds', title: 'Lower Wilds', titleRu: 'Нижние Дикие Земли', parentId: 'region-caldran', type: 'wilderness', canonStatus: 'workingCanon', shortDescription: 'Дикая южная окраина Кальдрана к Диким землям.', dmDescription: 'Нижние Дикие Земли: Ашхорнские Глубины, подступы к Диким землям. Пограничье цивилизации Кальдрана.', visualTone: 'Тёмный лес, ущелья.', playerSafe: true },

  // ── Talassian Union ─────────────────────────────────────────────────
  {
    id: 'region-talassian-union',
    title: 'Talassian Union of Islands',
    titleRu: 'Талассийский Союз Островов',
    parentId: 'region-known-world',
    type: 'state',
    canonStatus: 'fixedCanon',
    mapId: 'atlas-map-talassian-union',
    linkedMapIds: ['atlas-map-talassian-union'],
    shortDescription: 'Суверенный союз островов внешнего океана.',
    dmDescription:
      'Морская держава-союз островов в External Ocean, к нижне-левой стороне карты. Флот, торговля, спорные Три Вольные Короны на границе с Кальдраном.',
    playerDescription: 'Союз вольных островов, живущий морем, флотом и торговлей.',
    visualTone: 'Синее глубокое море, корабли, огни портов.',
    rulingPower: 'Союзный совет островов.',
    culture: 'Морская, торговая, флотская.',
    themes: ['море', 'флот', 'торговля'],
    linkedAdventureModuleIds: ['module-salt-mast-war', 'module-three-crowns'],
    playerSafe: true,
  },
  { id: 'region-talassian-port-auria', title: 'Port Auria', titleRu: 'Порт-Аурия', parentId: 'region-talassian-union', type: 'city', canonStatus: 'workingCanon', shortDescription: 'Главный торговый порт Союза.', dmDescription: 'Крупнейший торговый порт Талассийского Союза.', playerSafe: true },
  { id: 'region-talassian-havenstar', title: 'Havenstar', titleRu: 'Хейвенстар', parentId: 'region-talassian-union', type: 'city', canonStatus: 'workingCanon', shortDescription: 'Островной город-крепость.', dmDescription: 'Островной город-гавань Союза.', playerSafe: true },
  { id: 'region-talassian-mooncrest', title: 'Mooncrest', titleRu: 'Лунный Серп', parentId: 'region-talassian-union', type: 'city', canonStatus: 'workingCanon', shortDescription: 'Северный островной порт.', dmDescription: 'Островной порт на севере Союза.', playerSafe: true },
  { id: 'region-talassian-titansreach', title: 'Titansreach', titleRu: 'Титанов Предел', parentId: 'region-talassian-union', type: 'city', canonStatus: 'workingCanon', shortDescription: 'Дальний остров у Глубокого Океана.', dmDescription: 'Островной предел Союза у Deep Ocean.', playerSafe: true },
  { id: 'region-talassian-three-crowns', title: 'Three Free Crowns', titleRu: 'Три Вольные Короны', parentId: 'region-talassian-union', type: 'sea', canonStatus: 'workingCanon', shortDescription: 'Спорные острова между Союзом и Кальдраном.', dmDescription: 'Три Вольные Короны — спорные острова (Disputed Islands) в External Ocean между Талассией и Кальдраном.', dangers: ['спор о владении', 'пиратство'], linkedAdventureModuleIds: ['module-three-crowns'], playerSafe: true },

  // ── Free Cities of the East ─────────────────────────────────────────
  {
    id: 'region-free-cities',
    title: 'Free Cities of the East',
    titleRu: 'Вольные города Востока',
    parentId: 'region-known-world',
    type: 'region',
    canonStatus: 'fixedCanon',
    mapId: 'atlas-map-wildlands',
    linkedMapIds: ['atlas-map-wildlands'],
    shortDescription: 'Пограничный пояс хартий, торговли, наёмников и экспедиций.',
    dmDescription:
      'Цивилизованный пограничный пояс городов-хартий между Ауролеоном и Дикими землями. Города зарабатывают на опасности Диких земель и защищаются от неё. Тон: торговля, риск, серые сделки.',
    playerDescription: 'Вольные города-хартии на восточной границе, живущие торговлей и экспедициями в Дикие земли.',
    visualTone: 'Городские стены, наёмники, караваны, границы карты.',
    culture: 'Хартии, гильдии, наёмники.',
    factions: ['городские хартии', 'гильдии наёмников'],
    themes: ['граница', 'торговля', 'риск'],
    linkedAdventureModuleIds: ['module-argavon-caravan', 'module-thalorias-towers', 'module-varnel-deal'],
    playerSafe: true,
  },
  { id: 'region-argavon', title: 'Argavon', titleRu: 'Аргавон', parentId: 'region-free-cities', type: 'city', canonStatus: 'workingCanon', shortDescription: 'Северный вольный город караванов.', dmDescription: 'Аргавон — вольный город-хартия, узел караванных путей к Диким землям.', linkedAdventureModuleIds: ['module-argavon-caravan'], playerSafe: true },
  { id: 'region-thalorias', title: 'Thalorias', titleRu: 'Талориас', parentId: 'region-free-cities', type: 'city', canonStatus: 'workingCanon', shortDescription: 'Город магов и экспедиций к руинам.', dmDescription: 'Талориас — вольный город с сильной магической традицией, отправляющий экспедиции к руинам Диких земель.', linkedAdventureModuleIds: ['module-thalorias-towers'], playerSafe: true },
  { id: 'region-varnel', title: 'Varnel', titleRu: 'Варнел', parentId: 'region-free-cities', type: 'city', canonStatus: 'workingCanon', shortDescription: 'Город тайных сделок и переговоров.', dmDescription: 'Варнел — нейтральный вольный город, место тайных встреч и торговых сделок между державами.', linkedAdventureModuleIds: ['module-varnel-deal'], playerSafe: true },
  { id: 'region-tidestone', title: 'Tidestone', titleRu: 'Тайдстоун', parentId: 'region-free-cities', type: 'city', canonStatus: 'workingCanon', shortDescription: 'Южный прибрежный вольный город.', dmDescription: 'Тайдстоун — южный прибрежный вольный город у Гулдирского моря.', playerSafe: true },

  // ── Wildlands ───────────────────────────────────────────────────────
  {
    id: 'region-wildlands',
    title: 'Wildlands',
    titleRu: 'Дикие земли',
    parentId: 'region-known-world',
    type: 'wilderness',
    canonStatus: 'fixedCanon',
    mapId: 'atlas-map-wildlands',
    linkedMapIds: ['atlas-map-wildlands'],
    shortDescription: 'Огромный восточный край руин, племён, чудовищ и Неведомого Предела.',
    dmDescription:
      'Дикие земли — огромный восточный край руин, племён, локальных правил и чудовищ. За ними — Неведомый Предел, край доказанного знания мира. Городские законы здесь не действуют; действуют местные правила, которые чужаки не понимают.',
    playerDescription: 'Дикий восточный край руин, племён и опасностей за пределами вольных городов.',
    visualTone: 'Тёмное фэнтези, руины башен, пыль, страх неизвестного.',
    culture: 'Племена, локальные правила, руины древних.',
    dangers: ['чудовища', 'непонятные местные законы', 'руины'],
    themes: ['неизвестность', 'древность', 'выживание'],
    linkedAdventureModuleIds: ['module-argavon-caravan', 'module-thalorias-towers', 'module-black-spires'],
    playerSafe: true,
  },
  { id: 'region-wildlands-near-marches', title: 'Near Marches', titleRu: 'Ближние Пограничья', parentId: 'region-wildlands', type: 'wilderness', canonStatus: 'workingCanon', shortDescription: 'Ближайшая к вольным городам полоса Диких земель.', dmDescription: 'Ближние Пограничья — первая полоса Диких земель за вольными городами, где ещё встречаются караванные тропы.', playerSafe: true },
  { id: 'region-wildlands-dust-plains', title: 'Dust Plains', titleRu: 'Пыльные Равнины', parentId: 'region-wildlands', type: 'wilderness', canonStatus: 'workingCanon', shortDescription: 'Открытые пыльные равнины.', dmDescription: 'Пыльные Равнины — засушливые открытые пространства Диких земель.', playerSafe: true },
  { id: 'region-wildlands-river-veins', title: 'River Veins', titleRu: 'Речные Жилы', parentId: 'region-wildlands', type: 'wilderness', canonStatus: 'workingCanon', shortDescription: 'Сеть рек и проток Диких земель.', dmDescription: 'Речные Жилы — сеть рек, дающих жизнь и пути вглубь Диких земель.', playerSafe: true },
  { id: 'region-wildlands-dead-towers', title: 'Fields of Dead Towers', titleRu: 'Поля Мёртвых Башен', parentId: 'region-wildlands', type: 'wilderness', canonStatus: 'workingCanon', shortDescription: 'Поля древних руинных башен со стражами.', dmDescription: 'Поля Мёртвых Башен — руины древних башен, часть которых охраняют молчаливые стражи. Цель экспедиций Талориаса.', dangers: ['стражи руин', 'древняя магия'], linkedAdventureModuleIds: ['module-thalorias-towers'], playerSafe: true },
  { id: 'region-wildlands-bone-sands', title: 'Bone Sands', titleRu: 'Костяные Пески', parentId: 'region-wildlands', type: 'wilderness', canonStatus: 'workingCanon', shortDescription: 'Пустоши костей и старых битв.', dmDescription: 'Костяные Пески — пустоши, усеянные останками древних битв и существ.', playerSafe: true },
  { id: 'region-wildlands-green-teeth', title: 'Green Teeth', titleRu: 'Зелёные Зубья', parentId: 'region-wildlands', type: 'wilderness', canonStatus: 'workingCanon', shortDescription: 'Зубчатые зелёные хребты и джунгли.', dmDescription: 'Зелёные Зубья — заросшие зубчатые хребты, полные хищной жизни.', playerSafe: true },
  { id: 'region-wildlands-black-spires', title: 'Black Spires', titleRu: 'Чёрные Шпили', parentId: 'region-wildlands', type: 'wilderness', canonStatus: 'unknown', shortDescription: 'Далёкие чёрные шпили на краю известного.', dmDescription: 'Чёрные Шпили — далёкие тёмные пики у края Диких земель, почти не исследованные.', dangers: ['неизвестное'], linkedAdventureModuleIds: ['module-black-spires'], playerSafe: true },
  { id: 'region-wildlands-unknown-limit', title: 'Unknown Limit', titleRu: 'Неведомый Предел', parentId: 'region-wildlands', type: 'unknown', canonStatus: 'unknown', shortDescription: 'Край доказанного знания мира.', dmDescription: 'Неведомый Предел — граница, за которой заканчивается доказанное знание мира. Экспедиции уходят и не возвращаются.', dmSecrets: ['Что лежит за Пределом — на усмотрение мастера; канон намеренно оставляет пустоту.'], playerSafe: true },
];

export function getRegionById(id: string): WorldRegion | undefined {
  return WORLD_REGIONS.find((r) => r.id === id);
}

export function getChildRegions(parentId: string | undefined): WorldRegion[] {
  return WORLD_REGIONS.filter((r) => r.parentId === parentId);
}

/** All regions under the given roots, including the roots and every
 * descendant (depth-first). Used by the Atlas Map Workspace to list a map's
 * clickable regions. */
export function getRegionSubtree(rootIds: string[]): WorldRegion[] {
  const seen = new Set<string>();
  const out: WorldRegion[] = [];
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const region = getRegionById(id);
    if (region) out.push(region);
    for (const child of getChildRegions(id)) visit(child.id);
  };
  rootIds.forEach(visit);
  return out;
}

export function getRegionBreadcrumbs(id: string): WorldRegion[] {
  const chain: WorldRegion[] = [];
  let current = getRegionById(id);
  while (current) {
    chain.unshift(current);
    current = current.parentId ? getRegionById(current.parentId) : undefined;
  }
  return chain;
}
