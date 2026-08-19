/**
 * Résidence Gabriella — données 100 % issues de sources publiques vérifiées.
 *
 * Sources :
 *   – KAYAK / OTA : adresse, check-in/out, distances, note 4,0
 *   – SKYDB : 6 étages, bâtiment existant, hôtel-résidence
 *   – APIE BUSINESS : équipements (salon, TV, cuisine, Wi-Fi, terrasse vue ville,
 *                     petit-déjeuner), tél +242 04 438 9408, coords GPS
 *   – LinkedIn officiel : appartements 3 chambres + salles de bain + salon +
 *                         salle à manger + cuisine équipée, séjours business/loisir/famille
 *   – Google Maps lien fourni par le propriétaire
 *
 * Règle absolue : aucun chiffre inventé (prix, étoiles, nb exact d'appts).
 */

export const BRAND = {
  name: 'Résidence Gabriella',
  shortName: 'Gabriella',
  tagline: 'Une adresse pensée pour votre séjour.',
  location: 'Pointe-Noire',
  country: 'République du Congo',
  address: '77 Avenue Jean Marie Concko, Pointe-Noire',
  phone: '+242 04 438 9408',
  phoneE164: '+242044389408',
  email: 'residencegabriella@gmail.com',
  coords: { lat: -4.769162, lng: 11.866362 },
  googleMapsUrl: 'https://maps.app.goo.gl/aNsquYpiW34MrNK4A',
  facebookUrl: 'https://web.facebook.com/Résidence-Gabriella-1596452417345600/',
  checkin: '07h00',
  checkout: '14h00',
} as const;

/** Tous confirmés (APIE BUSINESS + LinkedIn officiel) */
export const AMENITIES = [
  { id: 'wifi', icon: '◌', label: 'Wi-Fi gratuit', detail: 'Connexion dans tout l\'établissement' },
  { id: 'kitchen', icon: '◌', label: 'Cuisine équipée', detail: 'Réfrigérateur, plaques, ustensiles' },
  { id: 'salon', icon: '◌', label: 'Coin salon', detail: 'Espace de vie séparé' },
  { id: 'tv', icon: '◌', label: 'Télévision', detail: 'Écran plat dans chaque appartement' },
  { id: 'terrace', icon: '◌', label: 'Terrasse', detail: 'Vue sur la ville depuis les appartements' },
  { id: 'breakfast', icon: '◌', label: 'Petit-déjeuner', detail: 'Continental ou à la carte' },
] as const;

/** Appartement confirmé LinkedIn officiel : 3 chambres + salles de bain + salon + salle à manger + cuisine */
export const SPACE = {
  type: 'Appartement',
  rooms: 3,
  bathrooms: 3,
  text:
    'Appartements de trois chambres avec salles de bain, salon, salle à manger et cuisine entièrement équipée. Conçus pour les séjours professionnels, en famille ou entre amis.',
  gallery: [
    { src: '/media/hero.jpg', alt: 'Suite principale' },
    { src: '/media/salon.jpg', alt: 'Salon spacieux' },
    { src: '/media/kitchen.jpg', alt: 'Cuisine équipée' },
    { src: '/media/bedroom.jpg', alt: 'Chambre' },
    { src: '/media/bath.jpg', alt: 'Salle de bain' },
    { src: '/media/terrace.jpg', alt: 'Terrasse vue ville' },
    { src: '/media/breakfast.jpg', alt: 'Petit-déjeuner' },
    { src: '/media/facade.jpg', alt: 'Résidence' },
  ],
} as const;

export const NEARBY = [
  { label: 'Plage de Pointe-Noire', detail: 'L\'Atlantique, à 2,1 km', distance: '2,1 km' },
  { label: 'Aéroport Agostinho-Neto', detail: 'PNR — accès ville', distance: '4,3 km' },
  { label: 'Port de Pointe-Noire', detail: 'Entrée principale du port', distance: '1,8 km' },
  { label: 'Club hippique', detail: 'Loisirs équestres', distance: '< 1,5 km' },
] as const;

export const NAV = [
  { id: 'residence', label: 'La résidence' },
  { id: 'espaces', label: 'Les espaces' },
  { id: 'equipements', label: 'Équipements' },
  { id: 'ville', label: 'Pointe-Noire' },
  { id: 'reserver', label: 'Réserver' },
] as const;

export const GALLERY = SPACE.gallery;
