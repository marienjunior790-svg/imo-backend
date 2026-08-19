import { useEffect, useRef } from 'react';
import { PLACES, type Place } from '../data/content';
import { Reveal } from './Reveal';

export function Location() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<{ flyTo: (lat: number, lng: number) => void } | null>(null);

  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    let cancelled = false;
    let map: import('leaflet').Map | undefined;

    void (async () => {
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !el) return;

      map = L.map(el, {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: false,
      }).setView([-4.79, 11.86], 12);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const icon = L.divIcon({
        className: 'ks-pin',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      for (const place of PLACES) {
        L.marker([place.lat, place.lng], { icon })
          .addTo(map)
          .bindPopup(`<strong>${place.label}</strong><br/>${place.detail}`);
      }

      leafletRef.current = {
        flyTo: (lat, lng) => map?.flyTo([lat, lng], 13, { duration: 0.9 }),
      };
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, []);

  const focus = (place: Place) => {
    leafletRef.current?.flyTo(place.lat, place.lng);
  };

  return (
    <section className="pad location" id="localisation">
      <Reveal>
        <p className="kicker">Pointe-Noire</p>
        <h2 className="display">Votre séjour commence ici.</h2>
        <p className="coords">04°46′ S · 11°52′ E</p>
        <p className="lede">
          La ville, l&apos;Atlantique, l&apos;aéroport. Les suites K Suites se répartissent entre
          le Wharf, Mpita et le centre-ville. Aucune adresse d&apos;immeuble n&apos;est affichée
          tant qu&apos;elle n&apos;est pas confirmée.
        </p>
      </Reveal>
      <div className="map-shell">
        <div ref={mapRef} className="map-canvas" role="region" aria-label="Carte de Pointe-Noire" />
        <div className="map-legend">
          {PLACES.map((place) => (
            <button type="button" key={place.id} onClick={() => focus(place)}>
              <strong>{place.label}</strong>
              <span>{place.detail}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
