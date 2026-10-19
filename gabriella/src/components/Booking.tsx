import { useState } from 'react';
import { BRAND } from '../data/content';

export function Booking() {
  const [done, setDone] = useState(false);
  const wa = `https://wa.me/${BRAND.phoneE164}`;

  return (
    <section className="section" id="reserver">
      <div className="wrap">
        <p className="label">Réservation</p>
        <h2 className="editorial" style={{ marginTop: '.8rem', marginBottom: '.6rem' }}>
          Parlons de votre séjour.
        </h2>
        <p className="lede" style={{ marginBottom: '2.5rem' }}>
          Remplissez ce formulaire ou contactez-nous directement via WhatsApp.
          Aucune transaction n&apos;est débitée ici — nous confirmons les disponibilités et les tarifs.
        </p>
        <div className="booking-grid">
          <div>
            {done ? (
              <div className="success-note">
                <p style={{ fontFamily: 'var(--font-s)', fontSize: '1.4rem', marginBottom: '.5rem' }}>
                  Demande envoyée.
                </p>
                <p style={{ color: 'var(--g-stone)' }}>
                  Nous vous contacterons pour confirmer les disponibilités.
                </p>
              </div>
            ) : (
              <form className="booking-form" onSubmit={e => { e.preventDefault(); setDone(true); }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.8rem' }}>
                  <div className="form-group">
                    <label htmlFor="checkin">Arrivée</label>
                    <input id="checkin" type="date" name="checkin" required />
                  </div>
                  <div className="form-group">
                    <label htmlFor="checkout">Départ</label>
                    <input id="checkout" type="date" name="checkout" required />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="guests">Voyageurs</label>
                  <select id="guests" name="guests">
                    {[1,2,3,4,5,6].map(n => (
                      <option key={n} value={n}>{n} voyageur{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="name">Nom complet</label>
                  <input id="name" name="name" autoComplete="name" required />
                </div>
                <div className="form-group">
                  <label htmlFor="phone">Téléphone / WhatsApp</label>
                  <input id="phone" type="tel" name="phone" autoComplete="tel" />
                </div>
                <div className="form-group">
                  <label htmlFor="email">E-mail</label>
                  <input id="email" type="email" name="email" autoComplete="email" required />
                </div>
                <div className="form-group">
                  <label htmlFor="msg">Message (optionnel)</label>
                  <textarea id="msg" name="msg" placeholder="Arrivée tardive, motif du séjour…" />
                </div>
                <button className="btn btn--solid" type="submit">Envoyer ma demande</button>
              </form>
            )}
          </div>
          <div className="booking-info">
            <div className="info-item">
              <strong>Adresse</strong>
              <p>{BRAND.address}</p>
            </div>
            <div className="info-item">
              <strong>Téléphone</strong>
              <a href={`tel:${BRAND.phoneE164}`}>{BRAND.phone}</a>
            </div>
            <div className="info-item">
              <strong>Check-in / Check-out</strong>
              <p>{BRAND.checkin} · {BRAND.checkout}</p>
            </div>
            <div className="info-item">
              <strong>Contacter via WhatsApp</strong>
              <a className="wa-cta" href={wa} target="_blank" rel="noreferrer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.12 1.527 5.849L.057 23.998l6.288-1.45A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.87a9.852 9.852 0 01-5.031-1.375l-.361-.214-3.735.98.997-3.639-.236-.373A9.847 9.847 0 012.13 12C2.13 6.533 6.533 2.13 12 2.13c5.467 0 9.87 4.403 9.87 9.87 0 5.467-4.403 9.87-9.87 9.87z"/>
                </svg>
                Réserver via WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
