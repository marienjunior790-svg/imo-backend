import PDFDocument from 'pdfkit';
import { injectable } from 'tsyringe';
import { decimalToNumber } from '../../shared/utils/response.util.js';

type LeaseWithRelations = {
  id: string;
  startDate: Date;
  endDate: Date;
  monthlyRent: { toNumber?: () => number } | number;
  depositAmount?: { toNumber?: () => number } | number | null;
  currency: string;
  terms?: string | null;
  apartment: {
    label: string;
    floor?: number | null;
    rooms?: number | null;
    surface?: { toNumber?: () => number } | number | null;
    building?: { name: string; address: string } | null;
  };
  tenant: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string | null;
    idNumber?: string | null;
    address?: string | null;
  };
  organization?: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    city?: string | null;
    country?: string | null;
  } | null;
};

export type LeaseContractOptions = {
  /** Nom de l'agent / gestionnaire qui établit le contrat */
  agentName?: string | null;
  agentRole?: string | null;
};

type PaymentWithRelations = {
  id: string;
  amount: { toNumber?: () => number } | number;
  amountPaid: { toNumber?: () => number } | number;
  currency: string;
  periodMonth: number;
  periodYear: number;
  status?: string | null;
  dueDate?: Date | null;
  paidAt?: Date | null;
  method?: string | null;
  reference?: string | null;
  lease: {
    tenant: { firstName: string; lastName: string; phone: string };
    apartment: { label: string };
    organization?: { name: string; phone?: string | null } | null;
  };
};

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function bufferFromPdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function formatMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString('fr-FR')} ${currency || 'XAF'}`;
}

function amountInWordsFr(amount: number, currency: string): string {
  const n = Math.round(amount);
  if (!Number.isFinite(n) || n < 0) return formatMoney(amount, currency);
  const units = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
  const teens = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const tens = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

  function underThousand(x: number): string {
    if (x < 10) return units[x];
    if (x < 20) return teens[x - 10];
    if (x < 100) {
      const t = Math.floor(x / 10);
      const u = x % 10;
      if (t === 7 || t === 9) {
        const base = t === 7 ? 60 : 80;
        const rest = x - base;
        const head = t === 7 ? 'soixante' : 'quatre-vingt';
        if (rest === 0) return t === 9 ? 'quatre-vingts' : head;
        if (rest < 10) return `${head}-${units[rest]}`;
        return `${head}-${teens[rest - 10]}`;
      }
      if (u === 0) return t === 8 ? 'quatre-vingts' : tens[t];
      const link = u === 1 && t !== 8 ? ' et ' : '-';
      return `${tens[t]}${link}${units[u]}`;
    }
    const h = Math.floor(x / 100);
    const r = x % 100;
    const head = h === 1 ? 'cent' : `${units[h]} cent${h > 1 && r === 0 ? 's' : ''}`;
    return r === 0 ? head : `${head} ${underThousand(r)}`;
  }

  function toWords(x: number): string {
    if (x < 1000) return underThousand(x);
    if (x < 1_000_000) {
      const m = Math.floor(x / 1000);
      const r = x % 1000;
      const head = m === 1 ? 'mille' : `${underThousand(m)} mille`;
      return r === 0 ? head : `${head} ${underThousand(r)}`;
    }
    const m = Math.floor(x / 1_000_000);
    const r = x % 1_000_000;
    const head = m === 1 ? 'un million' : `${toWords(m)} millions`;
    return r === 0 ? head : `${head} ${toWords(r)}`;
  }

  const cur = (currency || 'XAF').toUpperCase() === 'XAF' ? 'francs CFA' : currency;
  return `${toWords(n)} ${cur}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function monthsBetween(start: Date, end: Date): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()));
}

@injectable()
export class PdfService {
  /**
   * Contrat de location professionnel (bailleur / locataire / agent).
   * Document juridique de base — à faire relire selon le droit local applicable.
   */
  async generateLeaseContract(
    lease: LeaseWithRelations,
    options: LeaseContractOptions = {},
  ): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 48, size: 'A4', info: {
      Title: 'Contrat de location',
      Author: lease.organization?.name ?? 'ITC IMMO',
      Subject: `Bail — ${lease.apartment.label}`,
    } });
    const bufferPromise = bufferFromPdf(doc);

    const org = lease.organization;
    const orgName = org?.name ?? 'IMMO-tec';
    const city = org?.city ?? 'Brazzaville';
    const building = lease.apartment.building;
    const rent = decimalToNumber(lease.monthlyRent);
    const deposit = decimalToNumber(lease.depositAmount);
    const currency = lease.currency || 'XAF';
    const durationMonths = monthsBetween(new Date(lease.startDate), new Date(lease.endDate));
    const agentName = options.agentName?.trim() || null;
    const agentRole = options.agentRole?.trim() || 'Agent immobilier / Gestionnaire';
    const shortRef = lease.id.slice(-8).toUpperCase();

    // En-tête
    doc.fontSize(9).fillColor('#555555').text(orgName.toUpperCase(), { align: 'left' });
    if (org?.address) doc.text(org.address);
    const contactBits = [org?.phone ? `Tél. ${org.phone}` : null, org?.email ?? null].filter(Boolean);
    if (contactBits.length) doc.text(contactBits.join('  ·  '));
    doc.moveDown(0.6);
    doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#CCCCCC').stroke();
    doc.moveDown(1);

    doc.fillColor('#000000').fontSize(16).text('CONTRAT DE LOCATION À USAGE D’HABITATION', {
      align: 'center',
    });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#666666').text(`Référence : BAIL-${shortRef}`, { align: 'center' });
    doc.text(`Établi à ${city}, le ${formatDate(new Date())}`, { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(1.2);

    // Parties
    this.section(doc, 'ENTRE LES SOUSSIGNÉS');
    doc.fontSize(11).text('LE BAILLEUR', { underline: true });
    doc.moveDown(0.3);
    doc.text(`${orgName}`);
    if (org?.address) doc.text(`Siège / adresse : ${org.address}`);
    if (org?.phone) doc.text(`Téléphone : ${org.phone}`);
    if (org?.email) doc.text(`Email : ${org.email}`);
    doc.text(`Ci-après dénommé « le Bailleur ».`);
    doc.moveDown(0.8);

    doc.fontSize(11).text('LE LOCATAIRE', { underline: true });
    doc.moveDown(0.3);
    doc.text(`${lease.tenant.firstName} ${lease.tenant.lastName}`);
    if (lease.tenant.idNumber?.trim()) {
      doc.text(`Pièce d’identité (N°) : ${lease.tenant.idNumber.trim()}`);
    }
    if (lease.tenant.address?.trim()) {
      doc.text(`Domicile déclaré : ${lease.tenant.address.trim()}`);
    }
    doc.text(`Téléphone : ${lease.tenant.phone}`);
    if (lease.tenant.email) doc.text(`Email : ${lease.tenant.email}`);
    doc.text(`Ci-après dénommé « le Locataire ».`);
    doc.moveDown(0.8);

    if (agentName) {
      doc.fontSize(11).text('L’AGENT / GESTIONNAIRE', { underline: true });
      doc.moveDown(0.3);
      doc.text(`${agentName}`);
      doc.text(`Qualité : ${agentRole}`);
      doc.text(`Agissant pour le compte du Bailleur dans le cadre de la gestion locative.`);
      doc.moveDown(0.8);
    }

    doc.fontSize(11).text(
      'Il a été convenu ce qui suit :',
    );
    doc.moveDown(1);

    // Articles
    this.article(doc, '1', 'Objet du contrat');
    const aptBits = [
      lease.apartment.label,
      building ? `immeuble « ${building.name} »` : null,
      building?.address ? `situé ${building.address}` : null,
      lease.apartment.floor != null ? `étage ${lease.apartment.floor}` : null,
      lease.apartment.rooms != null ? `${lease.apartment.rooms} pièce(s)` : null,
      lease.apartment.surface != null
        ? `${decimalToNumber(lease.apartment.surface)} m²`
        : null,
    ].filter(Boolean);
    doc.text(
      `Le Bailleur donne en location au Locataire, qui accepte, le logement suivant : ${aptBits.join(', ')}.`,
    );
    doc.text(
      'Le bien est loué à usage exclusif d’habitation. Toute autre destination est interdite sans accord écrit du Bailleur.',
    );
    doc.moveDown(0.8);

    this.article(doc, '2', 'Durée');
    doc.text(
      `Le présent bail est conclu pour une durée de ${durationMonths} mois, ` +
        `prenant effet le ${formatDate(new Date(lease.startDate))} et se terminant le ${formatDate(new Date(lease.endDate))}, ` +
        `sauf reconduction ou résiliation anticipée dans les conditions prévues aux présentes.`,
    );
    doc.moveDown(0.8);

    this.article(doc, '3', 'Loyer et modalités de paiement');
    doc.text(
      `Le loyer mensuel est fixé à ${formatMoney(rent, currency)} ` +
        `(soit ${amountInWordsFr(rent, currency)}), hors charges éventuelles.`,
    );
    doc.text(
      'Le loyer est payable d’avance, au plus tard le 5 de chaque mois, selon le mode convenu avec le Bailleur ' +
        '(espèces, Mobile Money, virement bancaire ou tout autre moyen accepté).',
    );
    doc.text(
      'En cas de retard de plus de quinze (15) jours, le Bailleur pourra adresser une mise en demeure. ' +
        'Les impayés répétés pourront entraîner la résiliation du bail selon les voies légales applicables en République du Congo.',
    );
    doc.moveDown(0.8);

    this.article(doc, '4', 'Dépôt de garantie');
    if (deposit > 0) {
      doc.text(
        `Le Locataire verse un dépôt de garantie de ${formatMoney(deposit, currency)}. ` +
          'Ce dépôt ne porte pas intérêt et sera restitué à la fin du bail, déduction faite des sommes dues (loyers, réparations locatives, dégradations constatées), dans un délai raisonnable après état des lieux de sortie.',
      );
    } else {
      doc.text('Aucun dépôt de garantie n’est prévu au présent contrat, sauf avenant ultérieur.');
    }
    doc.moveDown(0.8);

    this.article(doc, '5', 'Charges et entretien');
    doc.text(
      'Le Locataire prend à sa charge l’entretien courant du logement, les petites réparations locatives, ainsi que les consommations d’eau, d’électricité et autres fluides dont il est l’usager, sauf disposition contraire écrite.',
    );
    doc.text(
      'Le Bailleur assure les réparations relevant de sa responsabilité (gros œuvre, toiture, parties communes le cas échéant), sous réserve des dégradations imputables au Locataire.',
    );
    doc.moveDown(0.8);

    this.article(doc, '6', 'Obligations du Locataire');
    doc.text('Le Locataire s’engage notamment à :');
    doc.text('• occuper paisiblement les lieux et respecter le voisinage ;');
    doc.text('• user du logement en bon père de famille et le maintenir en bon état ;');
    doc.text('• ne pas sous-louer ni céder le bail sans accord écrit du Bailleur ;');
    doc.text('• laisser accéder le Bailleur (ou son agent) pour visite ou travaux, sur préavis raisonnable, sauf urgence ;');
    doc.text('• signaler sans délai tout sinistre ou désordre important.');
    doc.moveDown(0.8);

    this.article(doc, '7', 'Obligations du Bailleur');
    doc.text('Le Bailleur s’engage notamment à :');
    doc.text('• délivrer un logement décent et en état d’usage ;');
    doc.text('• assurer la jouissance paisible des lieux ;');
    doc.text('• effectuer les réparations à sa charge dans des délais raisonnables.');
    if (agentName) {
      doc.text(
        `L’agent / gestionnaire (${agentName}) peut représenter le Bailleur pour la gestion courante, les relances et la coordination des interventions.`,
      );
    }
    doc.moveDown(0.8);

    this.article(doc, '8', 'Résiliation et préavis');
    doc.text(
      'Sauf usage contraire convenu par écrit, chaque partie peut résilier le bail moyennant un préavis d’un (1) mois ' +
        'notifié par écrit (lettre, message écrit ou tout moyen permettant d’en établir la date).',
    );
    doc.text(
      'En cas de manquement grave (impayés répétés, troubles de jouissance, dégradations importantes), le Bailleur pourra ' +
        'engager la résiliation selon les voies légales, après mise en demeure restée infructueuse.',
    );
    doc.moveDown(0.8);

    this.article(doc, '9', 'État des lieux');
    doc.text(
      'Un état des lieux d’entrée est établi contradictoirement à la remise des clés. Un état des lieux de sortie sera établi à la restitution des lieux. ' +
        'À défaut, le logement est réputé rendu dans l’état constaté lors de l’entrée, sauf preuve contraire.',
    );
    doc.moveDown(0.8);

    this.article(doc, '10', 'Droit applicable et litiges');
    doc.text(
      `Le présent contrat est régi par le droit en vigueur en République du Congo (${org?.country ?? 'CG'}), ` +
        `et notamment les usages locatifs applicables à ${city}.`,
    );
    doc.text(
      'Tout litige relatif à son interprétation ou à son exécution sera prioritairement tenté d’être résolu à l’amiable. ' +
        `À défaut, les tribunaux compétents de ${city} seront saisis.`,
    );
    doc.moveDown(0.8);

    if (lease.terms?.trim()) {
      this.article(doc, '11', 'Clauses particulières');
      doc.text(lease.terms.trim());
      doc.moveDown(0.8);
    }

    doc.fontSize(10).fillColor('#444444').text(
      'Les parties reconnaissent avoir pris connaissance de l’intégralité des clauses et les accepter. ' +
        'Le présent document constitue un contrat de location établi via ITC. Il doit être signé par les parties ' +
        '(et le cas échéant l’agent) pour produire ses effets. Conservez un exemplaire signé.',
      { align: 'justify' },
    );
    doc.fillColor('#000000');
    doc.moveDown(1.5);

    doc.fontSize(11).text(
      `Fait à ${city}, le ${formatDate(new Date())}, en deux (2) exemplaires originaux, dont un pour chaque partie` +
        `${agentName ? ' (et un pour l’agent le cas échéant)' : ''}.`,
    );
    doc.moveDown(2);

    const y = doc.y;
    const colW = agentName ? 160 : 240;
    const gap = agentName ? 18 : 40;
    let x = 48;

    this.signatureBlock(doc, x, y, 'Le Bailleur', orgName);
    x += colW + gap;
    this.signatureBlock(doc, x, y, 'Le Locataire', `${lease.tenant.firstName} ${lease.tenant.lastName}`);
    if (agentName) {
      x += colW + gap;
      this.signatureBlock(doc, x, y, 'L’Agent / Gestionnaire', agentName);
    }

    doc.end();
    return bufferPromise;
  }

  private section(doc: PDFKit.PDFDocument, title: string) {
    doc.fontSize(12).fillColor('#000000').text(title, { underline: true });
    doc.moveDown(0.6);
  }

  private article(doc: PDFKit.PDFDocument, num: string, title: string) {
    if (doc.y > 720) doc.addPage();
    doc.fontSize(12).fillColor('#000000').text(`Article ${num} — ${title}`, { underline: true });
    doc.fontSize(10.5).moveDown(0.35);
  }

  private signatureBlock(doc: PDFKit.PDFDocument, x: number, y: number, title: string, name: string) {
    doc.fontSize(10).text(title, x, y, { width: 150, align: 'center' });
    doc.fontSize(9).fillColor('#555555').text(name, x, y + 14, { width: 150, align: 'center' });
    doc.fillColor('#000000').fontSize(9).text('Lu et approuvé', x, y + 36, { width: 150, align: 'center' });
    doc.text('Signature :', x, y + 52, { width: 150, align: 'center' });
    doc.moveTo(x + 20, y + 100).lineTo(x + 130, y + 100).strokeColor('#999999').stroke();
  }

  async generatePaymentReceipt(payment: PaymentWithRelations): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const bufferPromise = bufferFromPdf(doc);

    const orgName = payment.lease.organization?.name ?? 'IMMO-tec';
    const amount = decimalToNumber(payment.amountPaid);
    const period = `${MONTHS_FR[payment.periodMonth - 1]} ${payment.periodYear}`;

    doc.fontSize(20).text('QUITTANCE DE LOYER', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).fillColor('#666').text(`N° ${payment.id}`, { align: 'center' });
    doc.fillColor('#000');
    doc.moveDown(2);

    doc.fontSize(12);
    doc.text(`Émetteur : ${orgName}`);
    if (payment.lease.organization?.phone) doc.text(`Tél. : ${payment.lease.organization.phone}`);
    doc.moveDown();
    doc.text(`Locataire : ${payment.lease.tenant.firstName} ${payment.lease.tenant.lastName}`);
    doc.text(`Logement : ${payment.lease.apartment.label}`);
    doc.text(`Période : ${period}`);
    doc.moveDown();

    doc.fontSize(16).text(`Montant reçu : ${formatMoney(amount, payment.currency || 'XAF')}`, { align: 'center' });
    doc.moveDown();

    if (payment.paidAt) doc.text(`Date de paiement : ${formatDate(new Date(payment.paidAt))}`);
    if (payment.method) doc.text(`Mode : ${payment.method.replace('_', ' ')}`);
    if (payment.reference) doc.text(`Référence : ${payment.reference}`);

    doc.moveDown(3);
    doc.fontSize(10).fillColor('#666').text('Document généré par IMMO-tec — Ce reçu fait foi de paiement.', { align: 'center' });

    doc.end();
    return bufferPromise;
  }

  /** Avis de paiement / rappel de loyer (avant encaissement). */
  async generatePaymentNotice(payment: PaymentWithRelations): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const bufferPromise = bufferFromPdf(doc);

    const orgName = payment.lease.organization?.name ?? 'IMMO-tec';
    const due = Math.max(0, decimalToNumber(payment.amount) - decimalToNumber(payment.amountPaid));
    const period = `${MONTHS_FR[payment.periodMonth - 1]} ${payment.periodYear}`;
    const tenant = `${payment.lease.tenant.firstName} ${payment.lease.tenant.lastName}`;

    doc.fontSize(20).text('AVIS DE PAIEMENT', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).fillColor('#666').text(`N° ${payment.id}`, { align: 'center' });
    doc.fillColor('#000');
    doc.moveDown(2);

    doc.fontSize(12);
    doc.text(`Émetteur : ${orgName}`);
    if (payment.lease.organization?.phone) doc.text(`Tél. : ${payment.lease.organization.phone}`);
    doc.moveDown();
    doc.text(`Destinataire : ${tenant}`);
    doc.text(`Tél. : ${payment.lease.tenant.phone}`);
    doc.text(`Logement : ${payment.lease.apartment.label}`);
    doc.text(`Période : ${period}`);
    if (payment.dueDate) doc.text(`Échéance : ${formatDate(new Date(payment.dueDate))}`);
    if (payment.status) doc.text(`Statut : ${payment.status}`);
    doc.moveDown();

    doc.fontSize(16).text(`Montant dû : ${formatMoney(due, payment.currency || 'XAF')}`, {
      align: 'center',
    });
    doc.moveDown();

    doc.fontSize(11).fillColor('#333');
    doc.text(
      'Merci de régulariser ce loyer dans les meilleurs délais. ' +
        'En cas de paiement déjà effectué, ignorez cet avis et conservez votre quittance.',
      { align: 'left' },
    );

    doc.moveDown(3);
    doc.fontSize(10).fillColor('#666').text('Document généré par IMMO-tec — Avis de paiement.', {
      align: 'center',
    });

    doc.end();
    return bufferPromise;
  }
}
