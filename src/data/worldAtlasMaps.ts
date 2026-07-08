import type { WorldAtlasMap } from '../types/worldAtlas';

/**
 * Canonical world maps surfaced by the World Atlas.
 *
 * These are NEW map records with atlas-prefixed ids. They do NOT reuse or
 * override any main-campaign `mapId` (e.g. the Greyholm region/city map
 * records used by Arc 1 / Arc 2). Greyholm canon images already shipped in
 * public/maps are reused here by path only — the underlying campaign map
 * records are untouched.
 */
export const WORLD_ATLAS_MAPS: WorldAtlasMap[] = [
  {
    id: 'atlas-map-known-world',
    title: 'Known World',
    titleRu: 'Известный мир',
    imageSrc: '/maps/atlas/known_world_canon.png',
    regionIds: ['region-known-world'],
    description: 'Карта показывает не границы мира, а границы уверенности. Север снизу, юг сверху.',
  },
  {
    id: 'atlas-map-aurelon',
    title: 'Aurelon',
    titleRu: 'Ауролеон',
    imageSrc: '/maps/atlas/aurelon_canon.png',
    regionIds: ['region-aurelon'],
    description: 'Держава закона, гражданства и устойчивой системы.',
  },
  {
    id: 'atlas-map-caldran',
    title: 'Caldran',
    titleRu: 'Кальдран',
    imageSrc: '/maps/atlas/caldran_canon.png',
    regionIds: ['region-caldran'],
    description: 'Держава Высоких Домов, плато, клятв и доказанного мастерства.',
  },
  {
    id: 'atlas-map-talassian-union',
    title: 'Talassian Union of Islands',
    titleRu: 'Талассийский Союз Островов',
    imageSrc: '/maps/atlas/talassian_union_canon.png',
    regionIds: ['region-talassian-union'],
    description: 'Суверенный союз островов внешнего океана.',
  },
  {
    id: 'atlas-map-wildlands',
    title: 'Wildlands',
    titleRu: 'Дикие земли',
    imageSrc: '/maps/atlas/wildlands_canon.png',
    regionIds: ['region-wildlands', 'region-free-cities'],
    description: 'Восточный край руин, племён, чудовищ и Неведомого Предела.',
  },
  {
    id: 'atlas-map-greyholm-region',
    title: 'Greyholm Region',
    titleRu: 'Регион Грейхольма',
    imageSrc: '/maps/regions/greyholm_region_canon.jpg',
    regionIds: ['region-greyholm-region'],
    description: 'Пограничный край Ауролеона у горной дуги Кальдрана.',
  },
  {
    id: 'atlas-map-greyholm-city',
    title: 'Greyholm City',
    titleRu: 'Город Грейхольм',
    imageSrc: '/maps/cities/greyholm_city_canon.jpg',
    regionIds: ['region-greyholm-city'],
    description: 'Приграничный город: гильдии, доки, рынок, стража, магическая коллегия.',
  },
];

export function getAtlasMapById(id: string): WorldAtlasMap | undefined {
  return WORLD_ATLAS_MAPS.find((m) => m.id === id);
}
