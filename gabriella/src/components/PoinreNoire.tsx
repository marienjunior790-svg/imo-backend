import { useEffect, useRef } from 'react';
import { BRAND, NEARBY } from '../data/content';

export function PointeNoire() {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    let cancelled = false;
    let map: import('leaflet').Map | undefined;

    void (async () => {
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !el) return;
      map = L.map(el, { zoomControl: false, scrollWheelZoom: false, attributionControl: true })
        .setView([BRAND.coords.lat, BRAND.coords.lng], 14);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      const icon = L.divIcon({ className: 'g-pin', iconSize: [10, 10], iconAnchor: [5, 5] });
      L.marker([BRAND.coords.lat, BRAND.coords.lng], { icon })
        .addTo(map)
        .bindPopup(`<strong>Résidence Gabriella</strong>77 Avenue Jean Marie Concko`)
        .openPopup();
    })();

    return () => { cancelled = true; map?.remove(); };
  }, []);

  return (
    <section className="section section--dark" id="ville">
      <div className="wrap">
        <p className="label">Pointe-Noire</p>
        <h2 className="editorial" style={{ marginTop: '.8rem', marginBottom: '1rem', color: 'var(--g-linen)' }}>
          La ville, à votre porte.
        </h2>
        <p className="lede" style={{ color: 'rgba(245,240,232,.72)' }}>
          Idéalement situé, à quelques minutes des repères de Pointe-Noire.
        </p>
        <div className="nearby-list" style={{ marginTop: '2rem' }}>
          {NEARBY.map(n => (
            <div className="nearby-item" key={n.label}>
              <div>
                <strong style={{ color: 'var(--g-sand)', fontSize: '.88rem' }}>{n.label}</strong>
                <p>{n.detail}</p>
              </div>
              <span className="nearby-dist">{n.distance}</span>
            </div>
          ))}
        </div>
        <div className="map-shell">
          <div ref={mapRef} className="map-canvas" role="region" aria-label="Carte — Résidence Gabriella" />
        </div>
        <div style={{ marginTop: '1.2rem', textAlign: 'right' }}>
          <a className="btn btn--ghost label" href={BRAND.googleMapsUrl} target="_blank" rel="noreferrer">
            Ouvrir dans Google Maps →
          </a>
        </div>
      </div>
    </section>
  );
}
