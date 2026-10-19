/**
 * ITC — contenu de l’expérience digitale.
 * Chiffres du chapitre Patrimoine = scénario de démonstration, pas un parc client réel.
 * Capacités IA = outils réellement implémentés dans le backend ITC (getUnits, getOutstandingPayments, etc.).
 */

export const BRAND = {
  name: 'ITC',
  product: 'Intelligence ITC',
  tagline: 'L\'immobilier, augmenté par l\'intelligence.',
  manifesto: ['L\'immobilier', 'entre dans', 'une nouvelle ère.'],
  lede:
    'ITC réunit patrimoine, gestion locative et intelligence artificielle dans une expérience conçue pour les propriétaires, agences et gestionnaires modernes.',
} as const;

export const NAV = [
  { id: 'explorer', label: 'Explorer' },
  { id: 'solution', label: 'Solution' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'patrimoine', label: 'Patrimoine' },
  { id: 'download', label: 'Télécharger' },
] as const;

/** Scénario visuel — démonstration produit, non des KPI d’un compte. */
export const DEMO_PORTFOLIO = {
  label: 'Lecture d\'un parc — démonstration',
  units: 24,
  occupied: 21,
  vacant: 3,
  collected: '98,4 %',
};

export const CHAPTERS = [
  {
    id: 'hero',
    kicker: '',
    title: '',
  },
  {
    id: 'explorer',
    kicker: 'Chapitre 01',
    title: 'L\'immobilier.',
    text: 'Un métier de matière, de baux, de loyers — trop longtemps éparpillé entre tableurs, messageries et logiciels qui ne se parlent pas.',
  },
  {
    id: 'patrimoine',
    kicker: 'Chapitre 02',
    title: 'Le patrimoine.',
    text: 'Chaque immeuble devient lisible : logements, occupation, contrats, encaissements. Pas un tableau. Une architecture.',
  },
  {
    id: 'intelligence',
    kicker: 'Chapitre 03',
    title: 'L\'intelligence.',
    text: 'Intelligence ITC interroge le dossier réel — logements, impayés, maintenance — sans inventer un chiffre.',
  },
  {
    id: 'solution',
    kicker: 'Chapitre 04',
    title: 'Le contrôle.',
    text: 'Propriétaires, agences, gestionnaires, agents terrain, locataires : une même vision, des rôles distincts.',
  },
  {
    id: 'itc',
    kicker: 'Chapitre 05',
    title: 'ITC.',
    text: 'Votre patrimoine. Une seule vision.',
  },
] as const;

export const AI_DEMO = [
  {
    user: 'Quels logements sont actuellement vacants ?',
    itc: '3 logements sont actuellement disponibles.',
    tool: 'getUnits',
    reveal: '3 disponibles · 21 occupés',
  },
  {
    user: 'Quels loyers restent impayés ?',
    itc: 'Je consulte les échéances PENDING, PARTIAL et LATE de votre organisation.',
    tool: 'getOutstandingPayments',
    reveal: 'Relances, montants XAF, locataires — depuis Prisma, jamais depuis une invention.',
  },
] as const;

export const PRODUCT_LAYERS = [
  { id: 'phone', label: 'Mobile', text: 'Copilote dans la poche.' },
  { id: 'estate', label: 'Patrimoine', text: 'Immeubles, logements, occupation.' },
  { id: 'ai', label: 'IA', text: 'Questions métier, actions confirmées.' },
  { id: 'pay', label: 'Loyers', text: 'Encaissements, impayés, XAF.' },
  { id: 'build', label: 'Immeubles', text: 'Le parc, lisible d\'un geste.' },
] as const;

export const FOOTER = {
  columns: [
    {
      title: 'Produit',
      links: [
        { label: 'Intelligence', href: '#intelligence' },
        { label: 'Patrimoine', href: '#patrimoine' },
        { label: 'Application', href: '#app' },
      ],
    },
    {
      title: 'Entreprise',
      links: [
        { label: 'À propos', href: '#itc' },
        { label: 'Mentions légales', href: '#legal' },
      ],
    },
    {
      title: 'Support',
      links: [{ label: 'Téléchargements', href: '#download' }],
    },
  ],
};
