import { AI_DEMO, CHAPTERS, DEMO_PORTFOLIO, PRODUCT_LAYERS } from '../data/content';
import { RELEASES } from '../data/releases';

export function Chapters() {
  const ch = CHAPTERS;
  return (
    <>
      <section className="chapter" id={ch[1].id}>
        <p className="kicker">{ch[1].kicker}</p>
        <h2 className="display">{ch[1].title}</h2>
        <p className="lede">{ch[1].text}</p>
      </section>

      <section className="chapter" id="patrimoine">
        <p className="kicker">{ch[2].kicker}</p>
        <h2 className="display">{ch[2].title}</h2>
        <p className="lede">{ch[2].text}</p>
        <p className="kicker" style={{ marginTop: '2rem' }}>
          {DEMO_PORTFOLIO.label}
        </p>
        <div className="stats">
          <div>
            <strong>{DEMO_PORTFOLIO.units}</strong>
            <span>Logements</span>
          </div>
          <div>
            <strong>{DEMO_PORTFOLIO.occupied}</strong>
            <span>Occupés</span>
          </div>
          <div>
            <strong>{DEMO_PORTFOLIO.vacant}</strong>
            <span>Disponibles</span>
          </div>
          <div>
            <strong>{DEMO_PORTFOLIO.collected}</strong>
            <span>Loyers collectés</span>
          </div>
        </div>
      </section>

      <section className="chapter" id="intelligence">
        <p className="kicker">{ch[3].kicker}</p>
        <h2 className="display">{ch[3].title}</h2>
        <p className="lede">{ch[3].text}</p>
        <div className="chat" role="region" aria-label="Démonstration Intelligence ITC">
          {AI_DEMO.map((turn) => (
            <div key={turn.user}>
              <div className="bubble user">
                <small>Vous</small>
                {turn.user}
              </div>
              <div className="bubble itc">
                <small>Intelligence ITC</small>
                {turn.itc}
                <div className="tool">
                  {turn.tool} · {turn.reveal}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="chapter" id="solution">
        <p className="kicker">{ch[4].kicker}</p>
        <h2 className="display">{ch[4].title}</h2>
        <p className="lede">{ch[4].text}</p>
      </section>

      <section className="chapter" id="app">
        <p className="kicker">Produit</p>
        <h2 className="display">L&apos;application.</h2>
        <p className="lede">
          Intelligence ITC dans la poche : questions métier, photos de dégâts, actions à confirmer.
          Pas une capture posée. Une constellation d&apos;interfaces.
        </p>
        <div className="phones">
          {PRODUCT_LAYERS.map((layer) => (
            <article className="device" key={layer.id}>
              <p className="kicker">{layer.id}</p>
              <h3>{layer.label}</h3>
              <p>{layer.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="breath" id="itc">
        <p className="kicker">{ch[5].kicker}</p>
        <h2>
          Votre patrimoine.
          <br />
          Une seule vision.
        </h2>
      </section>

      <section className="releases" id="download">
        <div>
          <p className="kicker">Téléchargement</p>
          <h2 className="display" style={{ fontSize: 'clamp(2.4rem, 6vw, 4.2rem)' }}>
            ITC Mobile
          </h2>
        </div>
        <div className="release">
          <h3>Android</h3>
          <div className="meta">
            <div>Version actuelle · {RELEASES.android.version}</div>
            <div>Build {RELEASES.android.build}</div>
            <div>Dernière mise à jour · {RELEASES.android.date}</div>
            <div>Taille · {RELEASES.android.size}</div>
            <div>Compatibilité · {RELEASES.android.compatibility}</div>
          </div>
          {RELEASES.android.available && RELEASES.android.downloadUrl ? (
            <a className="btn btn--solid" href={RELEASES.android.downloadUrl}>
              Télécharger
            </a>
          ) : (
            <button className="btn" type="button" disabled>
              Télécharger — artefact à brancher
            </button>
          )}
        </div>
        <div className="release">
          <h3>iOS</h3>
          <div className="meta">
            <div>Version actuelle · {RELEASES.ios.version}</div>
            <div>Compatibilité · {RELEASES.ios.compatibility}</div>
            <div>{RELEASES.ios.note}</div>
          </div>
          <button className="btn" type="button" disabled>
            Disponible prochainement
          </button>
        </div>
      </section>
    </>
  );
}
