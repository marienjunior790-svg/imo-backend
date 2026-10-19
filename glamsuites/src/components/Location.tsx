import { useEffect, useRef } from 'react';
import { BRAND } from '../data/content';
export function Location() {
  const mapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    let cancelled = false; let map: import('leaflet').Map | undefined;
    void (async () => {
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !el) return;
      map = L.map(el, { zoomControl: false, scrollWheelZoom: false })
        .setView([BRAND.coords.lat, BRAND.coords.lng], 14);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OSM © CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      const icon = L.divIcon({ className: 'gs-pin', iconSize: [10, 10], iconAnchor: [5, 5] });
      L.marker([BRAND.coords.lat, BRAND.coords.lng], { icon }).addTo(map)
        .bindPopup('<strong>Glam Suites Congo</strong>22 Av. Stéphane Tchitchelle, Bounguila').openPopup();
    })();
    return () => { cancelled = true; map?.remove(); };
  }, []);
  return (
    <section className="pad section--ink" id="ville">
      <div className="wrap">
        <p className="tag">Pointe-Noire</p>
        <h2 className="editorial" style={{ marginTop: '.8rem', marginBottom: '1rem', color: 'var(--gs-ivory)' }}>
          Une ville entre énergie urbaine, littoral et art de vivre.
        </h2>
        <p style={{ color: 'rgba(245,241,234,.65)', maxWidth: '36rem', fontSize: '1rem', marginBottom: '2rem' }}>
          Bounguila, à côté de la Clinique Kitoko.<br />
          22 Avenue Stéphane Tchitchelle — Pointe-Noire, République du Congo.
        </p>
        <div className="loc-grid">
          <div className="map-wrap">
            <div ref={mapRef} className="map-canvas" role="region" aria-label="Carte Glam Suites Congo" />
          </div>
          <div style={{ color: 'var(--gs-ivory)' }}>
            <div className="bi" style={{ borderColor: 'var(--gs-line-l)', paddingTop: 0, borderTop: 0 }}>
              <strong>Adresse</strong>
              <p style={{ color: 'rgba(245,241,234,.72)' }}>{BRAND.address}</p>
            </div>
            <div className="bi" style={{ marginTop: '1rem', borderColor: 'var(--gs-line-l)' }}>
              <strong>Quartier</strong>
              <p style={{ color: 'rgba(245,241,234,.72)' }}>{BRAND.district}</p>
            </div>
            <div className="bi" style={{ marginTop: '1rem', borderColor: 'var(--gs-line-l)' }}>
              <strong>Contact</strong>
              <a href={`tel:${BRAND.phoneE164}`} style={{ color: 'var(--gs-champagne)', display: 'block', marginTop: '.2rem' }}>{BRAND.phone}</a>
              <a href={`https://wa.me/${BRAND.phoneE164}`} target="_blank" rel="noreferrer"
                className="wa-link" style={{ marginTop: '.7rem', color: 'var(--gs-mist)' }}>
                WhatsApp →
              </a>
            </div>
            <a className="btn btn--champ" href={BRAND.googleMapsUrl} target="_blank" rel="noreferrer" style={{ marginTop: '1.8rem' }}>
              Ouvrir dans Google Maps →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
