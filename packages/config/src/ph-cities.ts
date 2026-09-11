/**
 * Canonical Philippine city/municipality names (master_plan §2AG Phase B).
 *
 * `PH_CITIES` is a deduplicated, alphabetically sorted list of the ~149 chartered/component
 * Philippine cities plus every municipality already present in the live VouchPlay directory data
 * (`Santo Tomas`). It feeds the onboarding/edit `<datalist>` (native autocomplete, free text still
 * allowed) and the canonical spelling `normalizeCity` resolves to. Cities are spelled with their real
 * "<Name> City" form (`Zamboanga City`, `Isabela City`, `Dumaguete City`, `Lamitan City`,
 * `Cotabato City`); municipalities and places this project already treats as plain names keep that
 * form (`Santo Tomas`, `Toledo`). Same-named cities/municipalities in different provinces are
 * disambiguated with a parenthetical, e.g. `San Carlos (Pangasinan)` vs `San Carlos (Negros Occidental)`.
 *
 * `normalizeCity` is pure and never drops or blanks data: an unrecognised place survives as a cleaned,
 * Title-Case string rather than being discarded. It resolves the handful of real typos found in the
 * live directory (`Zamboaga city`, `Isabella city`, `Sto.tomas`, `Isabela city basilan`, `Zamboanga i`)
 * via a small alias map, and otherwise matches case/whitespace/"City"-suffix variants of a canonical
 * `PH_CITIES` entry.
 */

/** Canonical Philippine city/municipality display names, alphabetically sorted. */
export const PH_CITIES: readonly string[] = [
  'Alaminos',
  'Angeles',
  'Antipolo',
  'Bacolod',
  'Bacoor',
  'Bago',
  'Baguio',
  'Bais',
  'Balanga',
  'Baliwag',
  'Batac',
  'Batangas City',
  'Bayawan',
  'Baybay',
  'Bayugan',
  'Biñan',
  'Bislig',
  'Bogo',
  'Borongan',
  'Butuan',
  'Cabadbaran',
  'Cabanatuan',
  'Cabuyao',
  'Cadiz',
  'Cagayan de Oro',
  'Calaca',
  'Calamba',
  'Calapan',
  'Calbayog',
  'Caloocan',
  'Candon',
  'Canlaon',
  'Carcar',
  'Carmona',
  'Catbalogan',
  'Cauayan',
  'Cavite City',
  'Cebu City',
  'Cotabato City',
  'Dagupan',
  'Danao',
  'Dapitan',
  'Dasmariñas',
  'Davao City',
  'Digos',
  'Dipolog',
  'Dumaguete City',
  'El Salvador',
  'Escalante',
  'Gapan',
  'General Santos',
  'General Trias',
  'Gingoog',
  'Guihulngan',
  'Himamaylan',
  'Ilagan',
  'Iligan',
  'Iloilo City',
  'Imus',
  'Iriga',
  'Isabela City',
  'Kabankalan',
  'Kidapawan',
  'Koronadal',
  'La Carlota',
  'Labo',
  'Lamitan City',
  'Laoag',
  'Lapu-Lapu',
  'Las Piñas',
  'Legazpi',
  'Ligao',
  'Lipa',
  'Lucena',
  'Maasin',
  'Mabalacat',
  'Makati',
  'Malabon',
  'Malaybalay',
  'Malolos',
  'Mandaluyong',
  'Mandaue',
  'Manila',
  'Marawi',
  'Marikina',
  'Masbate City',
  'Mati',
  'Meycauayan',
  'Muñoz',
  'Muntinlupa',
  'Naga (Camarines Sur)',
  'Naga (Cebu)',
  'Navotas',
  'Olongapo',
  'Ormoc',
  'Oroquieta',
  'Ozamiz',
  'Pagadian',
  'Palayan',
  'Panabo',
  'Parañaque',
  'Pasay',
  'Pasig',
  'Passi',
  'Puerto Princesa',
  'Quezon City',
  'Roxas',
  'Sagay',
  'Samal',
  'San Carlos (Negros Occidental)',
  'San Carlos (Pangasinan)',
  'San Fernando (La Union)',
  'San Fernando (Pampanga)',
  'San Jose (Nueva Ecija)',
  'San Jose del Monte',
  'San Juan',
  'San Pablo',
  'San Pedro',
  'Santa Rosa',
  'Santiago',
  'Santo Tomas',
  'Silay',
  'Sipalay',
  'Sorsogon City',
  'Surigao City',
  'Tabaco',
  'Tabuk',
  'Tacloban',
  'Tacurong',
  'Tagaytay',
  'Tagbilaran',
  'Taguig',
  'Tagum',
  'Talisay (Cebu)',
  'Talisay (Negros Occidental)',
  'Tanauan',
  'Tandag',
  'Tangub',
  'Tanjay',
  'Tarlac City',
  'Tayabas',
  'Toledo',
  'Trece Martires',
  'Tuguegarao',
  'Urdaneta',
  'Valencia',
  'Valenzuela',
  'Victorias',
  'Vigan',
  'Zamboanga City',
];

/**
 * Real typos/abbreviations found in the live directory that do not resolve through the generic
 * "City"-suffix/case matching below. Keys are lower-cased, whitespace-collapsed. Values are the
 * exact `PH_CITIES` entry to resolve to.
 */
const CITY_ALIASES: Readonly<Record<string, string>> = {
  zamboaga: 'Zamboanga City',
  'zamboanga i': 'Zamboanga City',
  isabella: 'Isabela City',
  'isabela basilan': 'Isabela City',
  'isabela city basilan': 'Isabela City',
  'sto tomas': 'Santo Tomas',
  'sto.tomas': 'Santo Tomas',
  cotabato: 'Cotabato City',
  toledo: 'Toledo',
};

/** Lower-cased canonical entry -> canonical entry, plus (for `<Name> City` entries) the bare name. */
const CANONICAL_LOOKUP: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const city of PH_CITIES) {
    map.set(city.toLowerCase(), city);
    const withoutCitySuffix = city.replace(/\s+city$/i, '');
    if (withoutCitySuffix !== city) {
      map.set(withoutCitySuffix.toLowerCase(), city);
    }
  }
  return map;
})();

/** Title-cases one hyphen-aware word, e.g. `lapu-lapu` -> `Lapu-Lapu`. */
function titleCaseWord(word: string): string {
  return word
    .split('-')
    .map((part) => (part.length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('-');
}

/** Title-cases a whole place name, space-separated. */
function titleCase(s: string): string {
  return s.toLowerCase().split(' ').map(titleCaseWord).join(' ');
}

/**
 * Normalizes a free-text city into its canonical `PH_CITIES` spelling when confident, otherwise
 * returns a cleaned Title-Case version of the input unchanged. Pure and idempotent: never blanks or
 * drops data - an unrecognised place always survives.
 *
 * Resolution order: (1) trim/collapse whitespace, strip a leading "City of "/"City Of " and a
 * trailing " City"/" city"; (2) exact case-insensitive match to a canonical `PH_CITIES` entry, with
 * or without its "City" suffix; (3) the small typo `CITY_ALIASES` map; (4) otherwise the cleaned,
 * Title-Cased input.
 */
export function normalizeCity(input: string | null | undefined): string {
  if (!input) return '';
  const collapsed = input.trim().replace(/\s+/g, ' ');
  if (!collapsed) return '';

  let cleaned = collapsed.replace(/^city of\s+/i, '');
  cleaned = cleaned.replace(/\s+city$/i, '');
  cleaned = cleaned.trim();
  if (!cleaned) return '';

  const key = cleaned.toLowerCase();
  const canonical = CANONICAL_LOOKUP.get(key) ?? CITY_ALIASES[key];
  if (canonical) return canonical;

  return titleCase(cleaned);
}
