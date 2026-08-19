import { useEffect, useMemo, useState } from 'react';
import { SUITES } from '../data/content';
import { submitInquiry } from '../lib/booking';

type Props = {
  initialSuiteId?: string;
  onClose: () => void;
};

const STEPS = ['Dates', 'Suite', 'Informations', 'Confirmer'] as const;

export function Booking({ initialSuiteId, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<'api' | 'local' | null>(null);
  const [form, setForm] = useState({
    checkIn: '',
    checkOut: '',
    suiteId: initialSuiteId ?? FEATURED_FALLBACK,
    guests: '2',
    name: '',
    email: '',
    phone: '',
    message: '',
  });

  useEffect(() => {
    document.body.classList.add('lock');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('lock');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const suite = useMemo(
    () => SUITES.find((s) => s.id === form.suiteId) ?? SUITES[0],
    [form.suiteId],
  );

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const next = () => {
    setError('');
    if (step === 0 && (!form.checkIn || !form.checkOut)) {
      setError('Indiquez vos dates de séjour.');
      return;
    }
    if (step === 2 && (!form.name || !form.email)) {
      setError('Nom et e-mail sont requis pour la demande.');
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const mode = await submitInquiry(form);
      setDone(mode);
    } catch {
      setError('La demande n\'a pas pu partir. Réessayez, ou écrivez-nous.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel">
        <div className="panel-head">
          <p className="quiet">Réservation</p>
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Fermer
          </button>
        </div>
        <h2 id="book-title" className="display" style={{ fontSize: '2.4rem' }}>
          Votre séjour
        </h2>
        <ol className="steps">
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? 'is-on' : undefined}>
              0{i + 1} {label}
            </li>
          ))}
        </ol>

        {done ? (
          <div>
            <p>
              Demande enregistrée pour la {suite.name}.{' '}
              {done === 'api'
                ? 'Elle a été transmise au système K Suites.'
                : 'Les disponibilités seront confirmées par K Suites. Aucune transaction n\'a été débitée — le moteur de réservation se branchera ici.'}
            </p>
            <button className="btn btn--solid" type="button" onClick={onClose} style={{ marginTop: '1.4rem' }}>
              Fermer
            </button>
          </div>
        ) : (
          <>
            {step === 0 && (
              <>
                <label className="field">
                  <span>Arrivée</span>
                  <input
                    type="date"
                    value={form.checkIn}
                    onChange={(e) => set('checkIn', e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Départ</span>
                  <input
                    type="date"
                    value={form.checkOut}
                    onChange={(e) => set('checkOut', e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Voyageurs</span>
                  <select value={form.guests} onChange={(e) => set('guests', e.target.value)}>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4+</option>
                  </select>
                </label>
              </>
            )}

            {step === 1 && (
              <label className="field">
                <span>Suite</span>
                <select value={form.suiteId} onChange={(e) => set('suiteId', e.target.value)}>
                  {SUITES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.district}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {step === 2 && (
              <>
                <label className="field">
                  <span>Nom</span>
                  <input value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" />
                </label>
                <label className="field">
                  <span>E-mail</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    autoComplete="email"
                  />
                </label>
                <label className="field">
                  <span>Téléphone</span>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    autoComplete="tel"
                  />
                </label>
                <label className="field">
                  <span>Message</span>
                  <textarea
                    value={form.message}
                    onChange={(e) => set('message', e.target.value)}
                    placeholder="Souhaits, horaires d'arrivée…"
                  />
                </label>
              </>
            )}

            {step === 3 && (
              <div className="summary">
                <p>
                  <strong>
                    {form.checkIn} → {form.checkOut}
                  </strong>
                </p>
                <p>
                  {suite.name} · {suite.district} · {form.guests} voyageur
                  {form.guests === '1' ? '' : 's'}
                </p>
                <p>
                  {form.name} · {form.email}
                </p>
                <p className="muted">Tarif sur demande — aucune transaction n&apos;est débitée ici.</p>
              </div>
            )}

            {error ? <p className="muted">{error}</p> : null}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.4rem', flexWrap: 'wrap' }}>
              {step > 0 ? (
                <button className="btn" type="button" onClick={() => setStep((s) => s - 1)}>
                  Retour
                </button>
              ) : null}
              {step < 3 ? (
                <button className="btn btn--solid" type="button" onClick={next}>
                  Continuer
                </button>
              ) : (
                <button className="btn btn--solid" type="button" onClick={() => void send()} disabled={busy}>
                  {busy ? 'Envoi…' : 'Confirmer la demande'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const FEATURED_FALLBACK = '302';
