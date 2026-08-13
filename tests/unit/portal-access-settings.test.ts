import {
  DEFAULT_PORTAL_ACCESS,
  parsePortalAccessSettings,
} from '../../src/shared/auth/portal-access-settings.js';

describe('portal-access-settings', () => {
  it('defaults to A+B and auto-provision ON', () => {
    expect(parsePortalAccessSettings(null)).toEqual(DEFAULT_PORTAL_ACCESS);
    expect(DEFAULT_PORTAL_ACCESS.autoProvisionOnLeaseActive).toBe(true);
    expect(DEFAULT_PORTAL_ACCESS.deliveryModes).toEqual(['IN_APP']);
  });

  it('parses org overrides including SMS opt-in', () => {
    const parsed = parsePortalAccessSettings({
      autoProvisionOnLeaseActive: false,
      deliveryModes: ['IN_APP', 'SMS'],
    });
    expect(parsed.autoProvisionOnLeaseActive).toBe(false);
    expect(parsed.deliveryModes).toEqual(['IN_APP', 'SMS']);
  });

  it('ignores invalid delivery modes', () => {
    const parsed = parsePortalAccessSettings({
      deliveryModes: ['IN_APP', 'FAX', 'EMAIL'],
    });
    expect(parsed.deliveryModes).toEqual(['IN_APP', 'EMAIL']);
  });
});
