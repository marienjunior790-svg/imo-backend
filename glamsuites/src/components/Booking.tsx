import { useState } from 'react';
import { BRAND, SUITES } from '../data/content';
export function Booking() {
  const [done, setDone] = useState(false);
  const wa = `https://wa.me/${BRAND.phoneE164}`;
  return (
    <section className="pad" id="contact">
      <div className="wrap">
        <p className="tag">Réservation</p>
        <h2 className="editorial" style={{ marginTop: '.8rem', marginBottom: '.6rem' }}>
          Votre suite vous attend.
        </h2>
        <p className="lede" style={{ marginBottom: '2.5rem' }}>
          Remplissez ce formulaire ou contactez-nous directement via WhatsApp.
          Aucune transaction n&apos;est débitée ici — nous confirmons disponibilités et tarifs.
        </p>
        <div className="booking-wrap">
          <div>
            {done ? (
              <div className="success-box">
                <h3>Demande reçue.</h3>
                <p style={{ color: 'var(--gs-stone)' }}>Nous vous contactons pour confirmer votre séjour.</p>
              </div>
            ) : (
              <form className="bform" onSubmit={e => { e.preventDefault(); setDone(true); }}>
                <div className="frow">
                  <div className="fg"><label>Arrivée</label><input type="date" required /></div>
                  <div className="fg"><label>Départ</label><input type="date" required /></div>
                </div>
                <div className="fg">
                  <label>Suite</label>
                  <select>
                    <option value="">Sélectionner une suite</option>
                    {SUITES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="fg"><label>Voyageurs</label>
                  <select>
                    {[1,2,3,4].map(n => <option key={n}>{n} voyageur{n > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
                <div className="fg"><label>Nom</label><input autoComplete="name" required /></div>
                <div className="frow">
                  <div className="fg"><label>Téléphone / WhatsApp</label><input type="tel" autoComplete="tel" /></div>
                  <div className="fg"><label>E-mail</label><input type="email" autoComplete="email" required /></div>
                </div>
                <div className="fg"><label>Message</label>
                  <textarea placeholder="Demandes particulières, heure d'arrivée…" />
                </div>
                <button className="btn btn--champ" type="submit">Demander une réservation</button>
              </form>
            )}
          </div>
          <div className="binfo" style={{ color: 'var(--gs-ink)' }}>
            <div className="bi" style={{ borderColor: 'var(--gs-line)', paddingTop: 0, borderTop: 0 }}>
              <strong>Adresse</strong>
              <p style={{ color: 'var(--gs-stone)' }}>{BRAND.address}</p>
            </div>
            <div className="bi" style={{ borderColor: 'var(--gs-line)' }}>
              <strong>Téléphone</strong>
              <a href={`tel:${BRAND.phoneE164}`} style={{ color: 'var(--gs-champagne)' }}>{BRAND.phone}</a>
            </div>
            <div className="bi" style={{ borderColor: 'var(--gs-line)' }}>
              <strong>WhatsApp</strong>
              <a className="wa-link" href={wa} target="_blank" rel="noreferrer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.12 1.527 5.849L.057 23.998l6.288-1.45A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.87a9.852 9.852 0 01-5.031-1.375l-.361-.214-3.735.98.997-3.639-.236-.373A9.847 9.847 0 012.13 12C2.13 6.533 6.533 2.13 12 2.13c5.467 0 9.87 4.403 9.87 9.87 0 5.467-4.403 9.87-9.87 9.87z"/>
                </svg>
                Réserver sur WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
