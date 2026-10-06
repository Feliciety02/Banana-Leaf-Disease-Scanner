import { CLASS_KEYS } from '../disease-data';
import { getTreatmentGuide, PRODUCT_SAFETY_NOTICE, PRODUCT_SECTION_TITLE, treatmentGuides } from '../treatment-data';

describe('treatment guide data contract', () => {
  it('provides a treatment guide for every fixed model class', () => {
    expect(Object.keys(treatmentGuides).sort()).toEqual([...CLASS_KEYS].sort());
  });

  it('looks up any model class without throwing', () => {
    for (const classKey of CLASS_KEYS) {
      expect(getTreatmentGuide(classKey).heading).toBeTruthy();
    }
  });

  it('gives disease classes at least one management tip', () => {
    for (const classKey of CLASS_KEYS) {
      expect(treatmentGuides[classKey].tips.length).toBeGreaterThan(0);
    }
  });

  it('shows a banana Sigatoka product with an FPA listing', () => {
    expect(treatmentGuides.sigatoka.products.map((product) => product.name)).toEqual(['Leader 500 SC']);
    expect(treatmentGuides.sigatoka.products[0].sourceUrl).toMatch(/fpa-gov\.ph/);
    expect(treatmentGuides['cordana-leaf-spot'].products).toEqual([]);
  });

  it('labels products plainly and requires a current FPA label check', () => {
    expect(PRODUCT_SECTION_TITLE).toBe('Products used');
    expect(PRODUCT_SAFETY_NOTICE).toMatch(/Fertilizer and Pesticide Authority/);
    expect(PRODUCT_SAFETY_NOTICE).toMatch(/Registration and labels can change/);
  });

  it('does not advertise products for healthy or panama-disease', () => {
    expect(treatmentGuides.healthy.products).toEqual([]);
    expect(treatmentGuides['panama-disease'].products).toEqual([]);
  });

  it('bundles a leaf example image for every supported class', () => {
    expect(treatmentGuides.sigatoka.leafImage).toBeTruthy();
    expect(treatmentGuides['cordana-leaf-spot'].leafImage).toBeTruthy();
    expect(treatmentGuides.healthy.leafImage).toBeTruthy();
    expect(treatmentGuides['panama-disease'].leafImage).toBeTruthy();
  });

  it('gives every step a short title for the result screen, in both languages', () => {
    const { localizedTreatment, shortSteps } = require('../../../i18n/content') as typeof import('../../../i18n/content');
    for (const classKey of CLASS_KEYS) {
      for (const language of ['en', 'fil'] as const) {
        const tips = localizedTreatment(classKey, language).tips;
        expect(tips).toHaveLength(treatmentGuides[classKey].tips.length);
        for (const tip of tips) expect(tip).toMatch(/^[^:]{3,60}: /);
        expect(shortSteps(classKey, language).every((step) => step.length <= 60)).toBe(true);
      }
    }
  });
});
