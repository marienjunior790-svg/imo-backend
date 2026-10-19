/**
 * K Suites — Pointe-Noire.
 * Données publiques (catalogue d'hébergement) : noms, quartiers, pax, Wi-Fi, clim.
 * Pas de prix, téléphone, WhatsApp, avis ou adresse d'immeuble inventés.
 */
export const BRAND = {
  name: 'K Suites',
  tagline: ['Le confort d\'un hôtel.', 'L\'intimité d\'une suite.'],
  city: 'Pointe-Noire',
  country: 'Congo',
} as const;

export const NAV = [
  { id: 'besoin', label: 'L\'idée' },
  { id: 'suites', label: 'Les suites' },
  { id: 'difference', label: 'La différence' },
  { id: 'ville', label: 'La ville' },
] as const;

export type Suite = {
  id: string;
  name: string;
  district: string;
  capacity: number;
  seaView: boolean;
  text: string;
  image: string;
  amenities: string[];
};

export const SUITES: Suite[] = [
  {
    id: '302',
    name: 'Suite 302',
    district: 'Wharf',
    capacity: 2,
    seaView: true,
    text: 'Une chambre tournée vers l\'Atlantique. Au Wharf, la mer est un voisin, pas un décor.',
    image: '/media/302.jpg',
    amenities: ['Wi-Fi', 'Climatisation', 'Vue mer', 'Balcon'],
  },
  {
    id: 'a07',
    name: 'Suite A07',
    district: 'Wharf',
    capacity: 2,
    seaView: true,
    text: 'Cuisine, balcon, indépendance. Un appartement pour vivre la ville à son rythme.',
    image: '/media/a07.jpg',
    amenities: ['Wi-Fi', 'Climatisation', 'Cuisine', 'Balcon', 'Vue mer'],
  },
  {
    id: '408',
    name: 'Suite 408',
    district: 'Wharf',
    capacity: 2,
    seaView: true,
    text: 'Plus haut. Plus calme. La 408 ouvre sur la mer sans le couloir d\'un hôtel.',
    image: '/media/408.jpg',
    amenities: ['Wi-Fi', 'Climatisation', 'Vue mer'],
  },
  {
    id: 's202',
    name: 'Suite S202',
    district: 'Mpita',
    capacity: 2,
    seaView: true,
    text: 'À Mpita, une suite double. Le quartier à portée, l\'intimité préservée.',
    image: '/media/s202.jpg',
    amenities: ['Wi-Fi', 'Climatisation', 'Vue mer'],
  },
  {
    id: '114',
    name: 'Suite 114',
    district: 'Centre-ville',
    capacity: 1,
    seaView: false,
    text: 'En centre-ville, un appartement pour une personne qui veut la ville sans la foule.',
    image: '/media/114.jpg',
    amenities: ['Wi-Fi', 'Climatisation'],
  },
];

export const WHY = [
  {
    title: 'Chez soi',
    text: 'Une vraie cuisine, une vraie porte. Pas un numéro de chambre dans un couloir.',
  },
  {
    title: 'La mer, selon les suites',
    text: 'Au Wharf et à Mpita, plusieurs logements regardent l\'Atlantique.',
  },
  {
    title: 'Pointe-Noire',
    text: 'Wharf, Mpita, centre-ville. La ville, l\'aéroport, la Côte Sauvage — à portée.',
  },
];
