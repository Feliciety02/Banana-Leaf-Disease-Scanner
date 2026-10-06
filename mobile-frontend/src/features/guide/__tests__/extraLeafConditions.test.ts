import { extraLeafConditions } from '../extraLeafConditions';

describe('additional leaf guide content', () => {
  it('keeps guide-only conditions outside the scan classes and pairs products with their FPA target', () => {
    const freckle = extraLeafConditions.find((item) => item.id === 'banana-freckle');
    const bunchyTop = extraLeafConditions.find((item) => item.id === 'banana-bunchy-top');

    expect(freckle?.image).toBeTruthy();
    expect(freckle?.product?.name).toBe('Leader 500 SC');
    expect(freckle?.product?.sourceUrl).toContain('fpa-gov.ph');
    expect(freckle?.text.en.note).toContain('not a scan result');
    expect(bunchyTop?.image).toBeTruthy();
    expect(bunchyTop?.product).toBeUndefined();
    expect(bunchyTop?.text.en.note).toContain('No curative product');
  });
});
