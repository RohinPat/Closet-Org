import { eventForApiCall, track } from '../telemetry';

describe('eventForApiCall', () => {
  it('maps the beta funnel endpoints', () => {
    expect(eventForApiCall('POST', '/auth/register')).toBe('signed_up');
    expect(eventForApiCall('POST', '/upload-clothing')).toBe('item_uploaded');
    expect(eventForApiCall('GET', '/outfits/recommend?seed=3&vibe=cozy')).toBe('outfit_recommended');
    expect(eventForApiCall('POST', '/planned-outfits')).toBe('outfit_planned');
    expect(eventForApiCall('POST', '/ai-stylist')).toBe('stylist_message_sent');
    expect(eventForApiCall('POST', '/fits')).toBe('fit_posted');
    expect(eventForApiCall('POST', '/auth/delete-account')).toBe('account_deleted');
  });

  it('only counts status updates that mark an item worn', () => {
    expect(eventForApiCall('PUT', '/item/12/status', JSON.stringify({ worn: true }))).toBe('item_worn');
    expect(eventForApiCall('PUT', '/item/12/status', JSON.stringify({ washed: true }))).toBeNull();
    expect(eventForApiCall('PUT', '/item/12/status', 'not json')).toBeNull();
  });

  it('ignores everything else', () => {
    expect(eventForApiCall('GET', '/closet')).toBeNull();
    expect(eventForApiCall('GET', '/auth/me')).toBeNull();
    expect(eventForApiCall('DELETE', '/fits/4')).toBeNull();
    expect(eventForApiCall('POST', '/auth/login')).toBeNull();
  });
});

describe('track without configuration', () => {
  it('is a silent no-op when no PostHog key is set', () => {
    expect(() => track('item_uploaded')).not.toThrow();
  });
});
