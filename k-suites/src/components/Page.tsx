import { BRAND, SUITES, WHY } from '../data/content';
import { useState } from 'react';

export function Page() {
  const [sent, setSent] = useState(false);

  return (
    <main>
      <section className="hero" id="top">
        <img src="/media/hero.jpg" alt="Intérieur d'une suite, lumière chaude — visuel de substitution" />
        <div>
          <p className="kicker">{BRAND.name}</p>
          <h1>
            {BRAND.tagline[0]}
            <br />
            <em>{BRAND.tagline[1]}</em>
          </h1>
          <p className="place">
            {BRAND.city}, {BRAND.country}
          </p>
          <div className="hero-actions">
            <a className="cta" href="#suites">
              Voir les suites
            </a>
            <a className="cta" href="#sejour">
              Demander un séjour
            </a>
          </div>
        </div>
      </section>

      <section className="block" id="besoin">
        <div className="need">
          <p className="kicker">L&apos;idée</p>
          <p className="big">On ne cherche plus une chambre. On cherche un seuil — une porte qui se ferme, et le calme derrière.</p>
        </div>
        <p className="lede" style={{ marginTop: '2rem' }}>
          Un hôtel accueille. Une suite abrite. À Pointe-Noire, {BRAND.name} propose des appartements
          indépendants : le service d&apos;une hospitalité soignée, l&apos;intimité d&apos;un chez-soi.
        </p>
      </section>

      <section className="block ink" id="suites">
        <p className="kicker">Les suites</p>
        <h2 className="display">Cinq adresses à lire.</h2>
        <p className="lede">Wharf, Mpita, centre-ville. Photographies de substitution en attendant le shooting officiel.</p>
        <div className="folio" style={{ marginTop: '3rem' }}>
          {SUITES.map((s) => (
            <article className="spread" key={s.id}>
              <img src={s.image} alt={`${s.name}, ${s.district}`} loading="lazy" />
              <div>
                <p className="kicker">
                  {s.district} · {s.capacity} voyageur{s.capacity > 1 ? 's' : ''}
                </p>
                <h3>{s.name}</h3>
                <p>{s.text}</p>
                <ul className="chips">
                  {s.amenities.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
                <p className="note">Tarif sur demande</p>
                <a className="cta" href="#sejour">
                  Séjourner ici
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="block" id="difference">
        <p className="kicker">La différence</p>
        <h2 className="display">Pourquoi K Suites.</h2>
        <div className="why">
          {WHY.map((w) => (
            <article key={w.title}>
              <h3>{w.title}</h3>
              <p>{w.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ocean" id="ville">
        <div>
          <p className="kicker">La ville</p>
          <h2 className="display">Pointe-Noire commence ici.</h2>
          <p className="lede">Atlantique, Wharf, Mpita, centre-ville. L&apos;aéroport Agostinho-Neto, la Côte Sauvage.</p>
        </div>
      </section>

      <section className="stay" id="sejour">
        <p className="kicker">Séjour</p>
        <h2 className="display">Parlons de vos dates.</h2>
        <p className="lede">Aucune réservation n&apos;est débitée ici. Une demande, puis une confirmation.</p>
        {sent ? (
          <p className="lede">Demande préparée. Les disponibilités seront confirmées par K Suites.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
          >
            <label>
              Arrivée
              <input type="date" required name="in" />
            </label>
            <label>
              Départ
              <input type="date" required name="out" />
            </label>
            <label>
              Suite
              <select name="suite" defaultValue="302">
                {SUITES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.district}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nom
              <input name="name" autoComplete="name" required />
            </label>
            <label>
              E-mail
              <input type="email" name="email" autoComplete="email" required />
            </label>
            <button className="cta" type="submit">
              Envoyer la demande
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
