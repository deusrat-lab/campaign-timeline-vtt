/**
 * Canon region presets — general locations and NPCs (houses/coalitions/powers)
 * drawn from the world canvases. When a user creates a new campaign on a given
 * world map, its (otherwise empty) library is pre-filled with COPIES of these
 * presets so the DM starts from the region's canon rather than a blank page.
 *
 * These are seed templates only; each campaign gets fresh ids and its own
 * isolated data. Nothing here is shared or mutated across campaigns.
 */

export interface PresetLocation { title: string; description?: string }
export interface PresetNpc { name: string; role?: string; description?: string }
export interface RegionPreset { locations: PresetLocation[]; npcs: PresetNpc[] }

/** Keyed by atlas map id (baseMapId of the campaign). */
export const REGION_PRESETS: Record<string, RegionPreset> = {
  'atlas-map-caldran': {
    locations: [
      { title: 'Высокое Плато', description: 'Сердце Кальдрана: поля, престолы и печати Высоких Домов.' },
      { title: 'Каменные Террасы', description: 'Ярусные города-террасы, Террасные врата, Скаар Вейлхаус.' },
      { title: 'Кузнечные Долины', description: 'Долины горнов и литеен — источник стали Кальдрана.' },
      { title: 'Солёный Уступ', description: 'Морская окраина: Солёные Гавани, Талассийский маршрут, плен.' },
      { title: 'Драконьи Кряжи', description: 'Земли виверн, старых договоров и охотников Крылатой Кости.' },
      { title: 'Нижние Дикие Земли', description: 'Южная окраина к Диким землям: Ашхорнские Глубины.' },
      { title: 'Престол Серебряного Камня', description: 'Резиденция Дома Серебряного Камня на плато.' },
      { title: 'Архив Вороньей Печати', description: 'Хранилище договоров, клятв и тайн Кальдрана.' },
      { title: 'Скаар Вейлхаус', description: 'Дом-крепость Дома Скаар на Каменных Террасах.' },
      { title: 'Дозор Хальдрик', description: 'Пограничная крепость Дома Хальдрик.' },
      { title: 'Дворы Железного Вепря', description: 'Военные дворы и школы Дома Железного Вепря.' },
      { title: 'Тихие Молотовые Залы', description: 'Кузни и мастерские Дома Тихого Молота.' },
    ],
    npcs: [
      { name: 'Дом Серебряного Камня', role: 'Высокий Дом Кальдрана', description: 'Престиж, легитимность, старшинство среди домов.' },
      { name: 'Дом Скаар', role: 'Высокий Дом Кальдрана', description: 'Тени, сделки и скрытая сила; один из опаснейших домов.' },
      { name: 'Дом Крылатой Кости', role: 'Высокий Дом Кальдрана', description: 'Охотники Драконьих Кряжей, договоры с вивернами.' },
      { name: 'Дом Тихого Молота', role: 'Высокий Дом Кальдрана', description: 'Ремесло и социальный лифт Кальдрана.' },
      { name: 'Дом Солёной Скалы', role: 'Высокий Дом Кальдрана', description: 'Господа Солёного Уступа, флот и плен.' },
      { name: 'Дом Хальдрик', role: 'Высокий Дом Кальдрана', description: 'Пограничная стража и дозоры.' },
      { name: 'Дом Чёрной Конницы', role: 'Высокий Дом Кальдрана', description: 'Лучшие конюшни и тяжёлая кавалерия.' },
      { name: 'Дом Вороньей Печати', role: 'Высокий Дом Кальдрана', description: 'Договоры, архивы и клятвы.' },
    ],
  },

  'atlas-map-aurelon': {
    locations: [
      { title: 'Грейхольм', description: 'Северный пограничный город у горной дуги Кальдрана.' },
      { title: 'Карад-Дум', description: 'Горный проход/крепость на северной дуге.' },
      { title: 'Айронрич', description: 'Западный портово-промышленный город.' },
      { title: 'Озеро Велира', description: 'Центральное озеро королевства, узел дорог.' },
      { title: 'Сильверхолт', description: 'Восточный город Ауролеона.' },
      { title: 'Грейстоун', description: 'Центральный каменный город.' },
      { title: 'Данвальд', description: 'Восточный лесной город у Диких земель.' },
      { title: 'Брайтфорд', description: 'Южный речной город-переправа.' },
      { title: 'Вестпорт', description: 'Западный морской порт.' },
    ],
    npcs: [
      { name: 'Корона Ауролеона', role: 'Власть', description: 'Централизованная монархия и бюрократия закона.' },
      { name: 'Стальной Щит Короны', role: 'Армия', description: 'Регулярная армия Ауролеона.' },
      { name: 'Башенные Дозорные', role: 'Стража', description: 'Пограничные и городские дозоры.' },
    ],
  },

  'atlas-map-known-world': {
    locations: [
      { title: 'Ауролеон', description: 'Держава закона, гражданства и устойчивой системы.' },
      { title: 'Кальдран', description: 'Держава Высоких Домов, плато и клятв.' },
      { title: 'Талассийский Союз Островов', description: 'Морской союз островов внешнего океана.' },
      { title: 'Вольные города Востока', description: 'Пояс городов-хартий перед Дикими землями.' },
      { title: 'Дикие земли', description: 'Восточный край руин, племён и Неведомого Предела.' },
    ],
    npcs: [],
  },

  'atlas-map-talassian-union': {
    locations: [
      { title: 'Порт-Аурия', description: 'Главный торгово-финансовый остров: деньги, договоры, долги.' },
      { title: 'Хейвенстар', description: 'Военный остров-крепость; Маячный Компакт.' },
      { title: 'Лунный Серп', description: 'Магия, тайные маршруты, контрабанда, разведка.' },
      { title: 'Титанов Предел', description: 'Военный флот; Адмиралтейство.' },
      { title: 'Три Вольные Короны', description: 'Спорные острова на границе с Кальдраном.' },
      { title: 'Солёный Уступ (граница)', description: 'Морская граница с Кальдраном.' },
    ],
    npcs: [
      { name: 'Золотая Лига Порт-Аурии', role: 'Коалиция', description: 'Финансово-торговая сила Союза.' },
      { name: 'Маячный Компакт Хейвенстара', role: 'Коалиция', description: 'Оборонительный компакт острова-крепости.' },
      { name: 'Лунный Синдикат (Ильтарсинский Альянс)', role: 'Коалиция', description: 'Тайная магия и контрабанда Лунного Серпа.' },
      { name: 'Адмиралтейство Титанова Предела', role: 'Коалиция', description: 'Военный флот Союза.' },
      { name: 'Марцелла Вейл-Аурия', role: 'Глава Золотой Лиги', description: 'Влиятельная фигура Порт-Аурии.' },
    ],
  },

  'atlas-map-wildlands': {
    locations: [
      { title: 'Аргавон', description: 'Сухопутные ворота: караваны и охрана экспедиций.' },
      { title: 'Талориас', description: 'Город магов и экспедиций к руинам.' },
      { title: 'Варнел', description: 'Нейтральный город сделок и посредничества.' },
      { title: 'Тайдстоун', description: 'Южный прибрежный вольный город.' },
      { title: 'Ближние Пограничья', description: 'Первая полоса Диких земель за городами.' },
      { title: 'Поля Мёртвых Башен', description: 'Руины древних башен со стражами.' },
      { title: 'Костяные Пески', description: 'Пустоши древних битв.' },
      { title: 'Чёрные Шпили', description: 'Далёкие тёмные пики у края известного.' },
      { title: 'Неведомый Предел', description: 'Граница доказанного знания мира.' },
    ],
    npcs: [
      { name: 'Городские хартии', role: 'Власть', description: 'Каждый вольный город живёт по своей хартии.' },
      { name: 'Гильдии наёмников', role: 'Фракция', description: 'Охрана караванов и экспедиций.' },
    ],
  },

  'atlas-map-greyholm-region': {
    locations: [
      { title: 'Город Грейхольм', description: 'Узел региона: доки, рынок, гильдии, стража.' },
      { title: 'Пограничные заставы', description: 'Дозоры на дороге к Кальдрану.' },
      { title: 'Окрестные деревни', description: 'Сельские поселения региона.' },
      { title: 'Горная дорога', description: 'Путь к перевалам северной дуги.' },
    ],
    npcs: [
      { name: 'Городская стража Грейхольма', role: 'Стража' },
      { name: 'Совет гильдий', role: 'Власть' },
    ],
  },

  'atlas-map-greyholm-city': {
    locations: [
      { title: 'Доки', description: 'Портовые причалы и склады.' },
      { title: 'Рынок', description: 'Главная торговая площадь города.' },
      { title: 'Гильдейский квартал', description: 'Дома и конторы гильдий.' },
      { title: 'Казармы стражи', description: 'База городской стражи.' },
      { title: 'Магическая коллегия', description: 'Коллегия магов Грейхольма.' },
      { title: 'Ратуша', description: 'Городское управление и совет.' },
    ],
    npcs: [
      { name: 'Капитан стражи', role: 'Стража' },
      { name: 'Глава торговой гильдии', role: 'Гильдия' },
      { name: 'Мастер коллегии', role: 'Магия' },
    ],
  },
};

export function getRegionPreset(baseMapId: string): RegionPreset | undefined {
  return REGION_PRESETS[baseMapId];
}
