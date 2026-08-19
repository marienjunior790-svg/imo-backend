/**
 * Glam Suites Congo — Pointe-Noire.
 *
 * Données 100% vérifiées sur sources publiques (Go Africa Online, synthèse OTA) :
 *   - Adresse : Bounguila / OCH, 22 Av. Stéphane Tchitchelle, Pointe-Noire
 *   - Tél / WhatsApp : +242 06 995 4717
 *   - Équipements : Wi-Fi, Canal+, climatisation, eau chaude, cuisine, panneaux solaires
 *   - Type : studios meublés / suites meublées
 *   - Quartier : Bounguila, proche Clinique Kitoko
 *
 * Non affichés (données OTA non officielles, non confirmées par la marque) :
 *   prix, superficie exacte, nombre de suites, étoiles, parking, piscine,
 *   restaurant, petit-déjeuner, avis.
 */

export const BRAND = {
  name: 'Glam Suites',
  full: 'Glam Suites Congo',
  tagline: 'Stay beautifully.',
  sub: 'Suites meublées contemporaines à Pointe-Noire.',
  city: 'Pointe-Noire',
  country: 'République du Congo',
  address: '22 Avenue Stéphane Tchitchelle, Bounguila, Pointe-Noire',
  district: 'Bounguila — à côté de la Clinique Kitoko',
  phone: '+242 06 995 4717',
  phoneE164: '+242069954717',
  coords: { lat: -4.7900, lng: 11.863 },
  googleMapsUrl: 'https://maps.google.com/maps?q=-4.7900,11.863',
  instagram: '',          // à renseigner dès que le compte officiel est confirmé
  facebook: '',           // idem
} as const;

export const NAV = [
  { id: 'suites', label: 'Suites' },
  { id: 'experience', label: 'Expérience' },
  { id: 'galerie', label: 'Galerie' },
  { id: 'ville', label: 'Pointe-Noire' },
  { id: 'contact', label: 'Contact' },
] as const;

/**
 * Équipements confirmés — Wi-Fi, Canal+, climatisation, eau chaude, cuisine, solaire.
 * Aucun équipement non vérifié.
 */
export const AMENITIES = [
  { id: 'wifi', label: 'Wi-Fi', detail: 'Connexion incluse dans chaque suite' },
  { id: 'canal', label: 'Canal+', detail: 'Bouquet satellite' },
  { id: 'ac', label: 'Climatisation', detail: 'Espace climatisé en permanence' },
  { id: 'water', label: 'Eau chaude', detail: 'Disponible à toute heure' },
  { id: 'kitchen', label: 'Cuisine', detail: 'Espace cuisine équipé' },
  { id: 'solar', label: 'Énergie solaire', detail: 'Panneaux solaires — continuité électrique' },
] as const;

/**
 * Suites : structure prête pour les noms et descriptions officiels.
 * Photos = substitutions Unsplash jusqu'au shooting officiel.
 */
export const SUITES = [
  {
    id: 'suite-01',
    index: '01',
    name: 'Suite — à nommer',
    editorial: 'Un espace à soi. La lumière filtre, le linge est impeccable, la ville est dehors.',
    image: '/media/suite-a.jpg',
    gallery: ['/media/suite-a.jpg', '/media/detail-a.jpg', '/media/texture.jpg'],
    note: 'Équipements et description officiels à compléter par Glam Suites.',
  },
  {
    id: 'suite-02',
    index: '02',
    name: 'Suite — à nommer',
    editorial: 'Intimité, confort, calme. Un appartement conçu pour que vous vous sentiez vraiment chez vous.',
    image: '/media/suite-b.jpg',
    gallery: ['/media/suite-b.jpg', '/media/detail-b.jpg', '/media/detail-a.jpg'],
    note: 'Équipements et description officiels à compléter par Glam Suites.',
  },
  {
    id: 'suite-03',
    index: '03',
    name: 'Suite — à nommer',
    editorial: 'Matières douces, lumière chaude, espace généreux. Glam Suites dans toute son expression.',
    image: '/media/suite-c.jpg',
    gallery: ['/media/suite-c.jpg', '/media/detail-c.jpg', '/media/texture.jpg'],
    note: 'Équipements et description officiels à compléter par Glam Suites.',
  },
] as const;

export const GALLERY_ALL = [
  { src: '/media/hero.jpg', alt: 'Chambre Glam Suites' },
  { src: '/media/suite-a.jpg', alt: 'Suite A' },
  { src: '/media/suite-b.jpg', alt: 'Suite B' },
  { src: '/media/suite-c.jpg', alt: 'Suite C' },
  { src: '/media/detail-a.jpg', alt: 'Détail linge' },
  { src: '/media/detail-b.jpg', alt: 'Détail espace' },
  { src: '/media/detail-c.jpg', alt: 'Cuisine' },
  { src: '/media/texture.jpg', alt: 'Espace séjour' },
] as const;

export const WHY = [
  {
    id: 'prive',
    label: 'Espace privé',
    text: 'Une suite pour vous seul. Pas un couloir d\'hôtel — une adresse.',
  },
  {
    id: 'contemporain',
    label: 'Design contemporain',
    text: 'Chaque suite pense le détail autant que le confort. L\'esthétique fait partie de l\'expérience.',
  },
  {
    id: 'localise',
    label: 'Pointe-Noire, le vrai',
    text: 'Bounguila, entre le centre et la côte. La ville autour, l\'intimité à l\'intérieur.',
  },
] as const;
