/**
 * K Suites — contenu de la démonstration FM Agence.
 *
 * RÈGLE : ne jamais inventer prix, téléphone, WhatsApp, adresse exacte,
 * avis, jacuzzi, self check-in, sécurité 24/7, fibre, réseaux sociaux.
 *
 * Sources publiques utilisées (août 2026) :
 * - Catalogue YosuTravels « K suites appartement » (noms, quartiers, pax,
 *   Wi-Fi, climatisation, douche, vue mer / balcon / cuisine lorsqu'indiqués).
 * - Fiches OTA Sleepzon / B&B.eu pour Suite 302 et A07 (parking, cuisine,
 *   balcon — uniquement lorsque répété).
 *
 * Les tarifs OTA existent mais ne sont PAS affichés : ils ne sont pas des
 * tarifs officiels K Suites, et une fourchette basse casserait le
 * positionnement premium. UI = « Tarif sur demande ».
 *
 * Photographies : SUBSTITUTION (Unsplash) jusqu'au shooting officiel.
 */

export const BRAND = {
  name: 'K Suites',
  tagline: ['Le confort d\'un hôtel.', 'L\'intimité d\'une suite.'],
  city: 'Pointe-Noire',
  country: 'Congo',
  cityCountry: 'Pointe-Noire, Congo',
} as const;

/** Laisser vide tant que le numéro officiel n'est pas confirmé. */
export const WHATSAPP_E164 =
  (import.meta.env.VITE_WHATSAPP_E164 as string | undefined)?.trim() ?? '';

export const INQUIRY_API_URL =
  (import.meta.env.VITE_INQUIRY_API_URL as string | undefined)?.trim() ?? '';

export const NAV = [
  { id: 'suites', label: 'Suites' },
  { id: 'experience', label: 'Expérience' },
  { id: 'services', label: 'Services' },
  { id: 'localisation', label: 'Localisation' },
  { id: 'a-propos', label: 'À propos' },
] as const;

export type AmenityKey =
  | 'wifi'
  | 'ac'
  | 'shower'
  | 'kitchen'
  | 'balcony'
  | 'seaView'
  | 'parking'
  | 'nonSmoking';

export const AMENITY_LABEL: Record<AmenityKey, string> = {
  wifi: 'Wi-Fi',
  ac: 'Climatisation',
  shower: 'Salle d\'eau',
  kitchen: 'Cuisine',
  balcony: 'Balcon',
  seaView: 'Vue mer',
  parking: 'Parking privé',
  nonSmoking: 'Non-fumeur',
};

export type Suite = {
  id: string;
  number: string;
  name: string;
  district: 'Wharf' | 'Mpita' | 'Centre-ville';
  editorial: string;
  capacity: number;
  seaView: boolean;
  amenities: AmenityKey[];
  image: string;
  gallery: string[];
  featured: boolean;
};

export const SUITES: Suite[] = [
  {
    id: '302',
    number: '302',
    name: 'Suite 302',
    district: 'Wharf',
    editorial:
      'Une chambre tournée vers l\'Atlantique. Au Wharf, la 302 offre l\'intimité d\'un appartement et le calme d\'un étage qui regarde la mer.',
    capacity: 2,
    seaView: true,
    amenities: ['wifi', 'ac', 'shower', 'nonSmoking', 'seaView', 'balcony', 'parking', 'kitchen'],
    image: '/media/suite-302.jpg',
    gallery: ['/media/suite-302.jpg', '/media/ocean.jpg', '/media/bath.jpg', '/media/linen.jpg'],
    featured: true,
  },
  {
    id: 'a07',
    number: 'A07',
    name: 'Suite A07',
    district: 'Wharf',
    editorial:
      'Indépendance assumée : cuisine équipée, balcon, Wi-Fi. Un appartement pour vivre Pointe-Noire à son rythme, sans le protocole d\'un hôtel.',
    capacity: 2,
    seaView: true,
    amenities: ['wifi', 'ac', 'shower', 'kitchen', 'balcony', 'seaView'],
    image: '/media/suite-a07.jpg',
    gallery: ['/media/suite-a07.jpg', '/media/kitchen.jpg', '/media/balcony.jpg', '/media/bath.jpg'],
    featured: true,
  },
  {
    id: '408',
    number: '408',
    name: 'Suite 408',
    district: 'Wharf',
    editorial:
      'Plus haut, plus loin. La 408 ouvre sur la mer dans un cadre paisible — l\'hospitalité K Suites, sans le couloir d\'hôtel.',
    capacity: 2,
    seaView: true,
    amenities: ['wifi', 'ac', 'shower', 'nonSmoking', 'seaView'],
    image: '/media/suite-408.jpg',
    gallery: ['/media/suite-408.jpg', '/media/living.jpg', '/media/linen.jpg'],
    featured: true,
  },
  {
    id: 's202',
    number: 'S202',
    name: 'Suite S202',
    district: 'Mpita',
    editorial:
      'À Mpita, une suite double pensée pour deux. Le quartier à portée, l\'intimité préservée.',
    capacity: 2,
    seaView: true,
    amenities: ['wifi', 'ac', 'shower', 'nonSmoking', 'seaView'],
    image: '/media/suite-s202.jpg',
    gallery: ['/media/suite-s202.jpg', '/media/living.jpg', '/media/threshold.jpg'],
    featured: true,
  },
  {
    id: '114',
    number: '114',
    name: 'Suite 114',
    district: 'Centre-ville',
    editorial:
      'Au centre-ville de Pointe-Noire, un appartement calme et fonctionnel — conçu pour une personne qui veut la ville sans la foule d\'un hôtel.',
    capacity: 1,
    seaView: false,
    amenities: ['wifi', 'ac', 'shower', 'nonSmoking'],
    image: '/media/suite-114.jpg',
    gallery: ['/media/suite-114.jpg', '/media/linen.jpg', '/media/threshold.jpg'],
    featured: true,
  },
  {
    id: 'c1',
    number: 'C1',
    name: 'Suite C1',
    district: 'Wharf',
    editorial:
      'Suite double au Wharf, tournée vers la mer. Un refuge à deux, à quelques minutes de l\'océan.',
    capacity: 2,
    seaView: true,
    amenities: ['wifi', 'ac', 'shower', 'nonSmoking', 'seaView'],
    image: '/media/suite-c1.jpg',
    gallery: ['/media/suite-c1.jpg', '/media/ocean.jpg', '/media/dark-bed.jpg'],
    featured: false,
  },
  {
    id: 'a09',
    number: 'A09',
    name: 'Suite A09',
    district: 'Mpita',
    editorial:
      'À Mpita, une suite pour deux, avec la mer dans le champ. Confort d\'appartement, rythme de la ville.',
    capacity: 2,
    seaView: true,
    amenities: ['wifi', 'ac', 'shower', 'nonSmoking', 'seaView'],
    image: '/media/living.jpg',
    gallery: ['/media/living.jpg', '/media/ocean.jpg', '/media/bath.jpg'],
    featured: false,
  },
  {
    id: '504',
    number: '504',
    name: 'Suite 504',
    district: 'Wharf',
    editorial:
      'Étage élevé, vue mer, Wharf. La 504 reprend la promesse K Suites : se sentir chez soi, face à l\'Atlantique.',
    capacity: 2,
    seaView: true,
    amenities: ['wifi', 'ac', 'shower', 'nonSmoking', 'seaView'],
    image: '/media/dark-bed.jpg',
    gallery: ['/media/dark-bed.jpg', '/media/ocean.jpg', '/media/linen.jpg'],
    featured: false,
  },
  {
    id: '503',
    number: '503',
    name: 'Suite 503',
    district: 'Wharf',
    editorial:
      'Une chambre, la mer en face. Au Wharf, la 503 est un appartement d\'une chambre pensé pour deux.',
    capacity: 2,
    seaView: true,
    amenities: ['wifi', 'ac', 'shower', 'nonSmoking', 'seaView'],
    image: '/media/terrace.jpg',
    gallery: ['/media/terrace.jpg', '/media/bath.jpg', '/media/ocean.jpg'],
    featured: false,
  },
  {
    id: '401',
    number: '401',
    name: 'Suite 401',
    district: 'Wharf',
    editorial:
      'Cadre calme et fonctionnel au Wharf. La 401 privilégie le repos et la simplicité d\'un vrai appartement.',
    capacity: 2,
    seaView: false,
    amenities: ['wifi', 'ac', 'shower', 'nonSmoking'],
    image: '/media/threshold.jpg',
    gallery: ['/media/threshold.jpg', '/media/linen.jpg', '/media/kitchen.jpg'],
    featured: false,
  },
];

export const FEATURED_SUITES = SUITES.filter((s) => s.featured);

export const EXPERIENCE = [
  {
    id: 'confort',
    title: 'Confort',
    text: 'Des espaces pensés pour se sentir immédiatement chez soi.',
    image: '/media/linen.jpg',
  },
  {
    id: 'intimite',
    title: 'Intimité',
    text: 'Une expérience plus privée qu\'un hôtel traditionnel.',
    image: '/media/dark-bed.jpg',
  },
  {
    id: 'technologie',
    title: 'Technologie',
    text: 'Wi-Fi et un séjour pensé pour l\'autonomie — plus simple qu\'une réception d\'hôtel.',
    image: '/media/threshold.jpg',
  },
  {
    id: 'securite',
    title: 'Sécurité',
    text: 'Une présence et une infrastructure pensées pour la tranquillité des voyageurs.',
    image: '/media/night.jpg',
  },
  {
    id: 'localisation',
    title: 'Localisation',
    text: 'Pointe-Noire à portée de main.',
    image: '/media/ocean.jpg',
  },
] as const;

/**
 * Services affichés = uniquement ceux confirmés sur au moins une source publique,
 * ou indiqués « selon les suites ». Le reste est dans PENDING_SERVICES (non rendu).
 */
export const SERVICES: {
  id: string;
  title: string;
  text: string;
  scope: 'collection' | 'some';
}[] = [
  {
    id: 'wifi',
    title: 'Wi-Fi',
    text: 'Une connexion dans chaque suite.',
    scope: 'collection',
  },
  {
    id: 'ac',
    title: 'Climatisation',
    text: 'Un climat constant, pensé pour Pointe-Noire.',
    scope: 'collection',
  },
  {
    id: 'kitchen',
    title: 'Cuisine',
    text: 'L\'indépendance d\'un appartement. Cuisine entièrement équipée confirmée sur la A07.',
    scope: 'some',
  },
  {
    id: 'parking',
    title: 'Parking privé',
    text: 'Annoncé sur certaines adresses, notamment la 302 et la A07.',
    scope: 'some',
  },
  {
    id: 'sea',
    title: 'Vue mer',
    text: 'Plusieurs suites du Wharf et de Mpita regardent l\'Atlantique.',
    scope: 'some',
  },
  {
    id: 'balcony',
    title: 'Balcon',
    text: 'Un dehors à soi, confirmé sur la A07 et la 302.',
    scope: 'some',
  },
];

/** Structure prête à activer — ne pas afficher tant que non confirmé. */
export const PENDING_SERVICES = [
  'self-check-in',
  'securite-24-7',
  'nettoyage',
  'jacuzzi',
  'wifi-fibre',
  'assistance-client',
] as const;

export type Place = {
  id: string;
  label: string;
  detail: string;
  lat: number;
  lng: number;
  kind: 'city' | 'nature' | 'transit' | 'district';
};

/** Repères géographiques publics — pas l'adresse d'un immeuble K Suites. */
export const PLACES: Place[] = [
  {
    id: 'pnr',
    label: 'Pointe-Noire',
    detail: 'Centre urbain',
    lat: -4.7761,
    lng: 11.8636,
    kind: 'city',
  },
  {
    id: 'airport',
    label: 'Aéroport Agostinho-Neto',
    detail: 'PNR — accès ville',
    lat: -4.816,
    lng: 11.8866,
    kind: 'transit',
  },
  {
    id: 'cote',
    label: 'Côte Sauvage',
    detail: 'Atlantique, ouest de la ville',
    lat: -4.795,
    lng: 11.82,
    kind: 'nature',
  },
  {
    id: 'wharf',
    label: 'Wharf',
    detail: 'Quartier — plusieurs suites K Suites',
    lat: -4.778,
    lng: 11.838,
    kind: 'district',
  },
  {
    id: 'mpita',
    label: 'Mpita',
    detail: 'Quartier — suites A09 & S202',
    lat: -4.805,
    lng: 11.858,
    kind: 'district',
  },
  {
    id: 'centre',
    label: 'Centre-ville',
    detail: 'Quartier — suite 114',
    lat: -4.776,
    lng: 11.858,
    kind: 'district',
  },
];

export const ABOUT = {
  kicker: 'La marque',
  title: 'Une collection d\'appartements, pas un hôtel.',
  paragraphs: [
    'K Suites rassemble des appartements indépendants à Pointe-Noire — au Wharf, à Mpita, en centre-ville. Studios, deux chambres, trois chambres : le catalogue public décrit une offre faite pour le voyage d\'affaires comme pour le séjour plus long.',
    'Certains logements regardent la mer. Tous promettent la même chose : le confort d\'un hôtel, l\'intimité d\'une suite.',
  ],
};

export const SEO = {
  title: 'K Suites — Le confort d\'un hôtel. L\'intimité d\'une suite. | Pointe-Noire',
  description:
    'K Suites, appartements et suites à Pointe-Noire, Congo. Wharf, Mpita, centre-ville. Une hospitalité premium, plus intime qu\'un hôtel.',
};
