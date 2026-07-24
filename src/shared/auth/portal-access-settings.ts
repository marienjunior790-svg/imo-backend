/**
 * Paramètres portail locataire par organisation (spec v1.0).
 */
export type DeliveryMode = 'IN_APP' | 'EMAIL' | 'SMS';

export type PortalAccessSettings = {
  /** Défaut true — provision auto quand un bail passe ACTIVE */
  autoProvisionOnLeaseActive: boolean;
  /** Défaut A+B ; SMS opt-in */
  deliveryModes: DeliveryMode[];
};

export const DEFAULT_PORTAL_ACCESS: PortalAccessSettings = {
  autoProvisionOnLeaseActive: true,
  deliveryModes: ['IN_APP', 'EMAIL'],
};

export function parsePortalAccessSettings(raw: unknown): PortalAccessSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PORTAL_ACCESS };
  const o = raw as Record<string, unknown>;
  const modes = Array.isArray(o.deliveryModes)
    ? (o.deliveryModes.filter((m) => m === 'IN_APP' || m === 'EMAIL' || m === 'SMS') as DeliveryMode[])
    : DEFAULT_PORTAL_ACCESS.deliveryModes;
  return {
    autoProvisionOnLeaseActive:
      typeof o.autoProvisionOnLeaseActive === 'boolean'
        ? o.autoProvisionOnLeaseActive
        : DEFAULT_PORTAL_ACCESS.autoProvisionOnLeaseActive,
    deliveryModes: modes.length > 0 ? modes : [...DEFAULT_PORTAL_ACCESS.deliveryModes],
  };
}
