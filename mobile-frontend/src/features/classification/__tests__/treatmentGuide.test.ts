import { CLASS_KEYS } from '../disease-data';
import { getTreatmentGuide, treatmentGuides } from '../treatment-data';

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

  it('lists three products with prices for sigatoka and cordana', () => {
    expect(treatmentGuides.sigatoka.products.map((product) => product.name)).toEqual(['Timorex Gold', 'Blindax', 'Sonata']);
    expect(treatmentGuides['cordana-leaf-spot'].products.map((product) => product.name)).toEqual(['Bordeaux Mix 1%', 'Kupper 500', 'TopCop']);
    for (const product of [...treatmentGuides.sigatoka.products, ...treatmentGuides['cordana-leaf-spot'].products]) {
      expect(product.price).toMatch(/^₱[\d,]+$/);
      expect(product.description).toBeTruthy();
    }
  });

  it('does not advertise products for healthy or panama-disease', () => {
    expect(treatmentGuides.healthy.products).toEqual([]);
    expect(treatmentGuides['panama-disease'].products).toEqual([]);
  });

  it('bundles a leaf example image for the three visible conditions', () => {
    expect(treatmentGuides.sigatoka.leafImage).toBeTruthy();
    expect(treatmentGuides['cordana-leaf-spot'].leafImage).toBeTruthy();
    expect(treatmentGuides.healthy.leafImage).toBeTruthy();
    expect(treatmentGuides['panama-disease'].leafImage).toBeNull();
  });

  it('bundles a product image for every listed product', () => {
    for (const classKey of ['sigatoka' as const, 'cordana-leaf-spot' as const]) {
      for (const product of treatmentGuides[classKey].products) {
        expect(product.image).toBeTruthy();
      }
    }
  });
});