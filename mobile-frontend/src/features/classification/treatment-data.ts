import { ClassKey } from './types';

export type TreatmentProduct = {
  name: string;
  description: string;
  sourceUrl: string;
  image?: number;
};

export type TreatmentGuideContent = {
  heading: string;
  leafImage: number | null;
  products: TreatmentProduct[];
  tips: string[];
};

// Higher-resolution educational leaf examples shared with the web disease guide.
// Attribution: web-frontend/public/assets/disease-guide/README.md.
const blackSigatokaLeaf = require('../../../assets/figure19_extracted_images/sigatoka_reference.webp');
const cordanaLeaf = require('../../../assets/figure19_extracted_images/cordana_reference.webp');
const healthyLeaf = require('../../../assets/figure19_extracted_images/healthy_reference.webp');
const panamaLeaf = require('../../../assets/figure19_extracted_images/panama_leaf_example.webp');

// The FPA lists the crop and target disease for this product. Recheck its
// current registration and the exact label before any application.
export const PRODUCT_SECTION_TITLE = 'Products used';
export const PRODUCT_SAFETY_NOTICE =
  'The Fertilizer and Pesticide Authority (FPA) lists this product for banana and the named disease. Registration and labels can change. Ask your agriculturist to confirm the diagnosis and current label before buying or spraying.';

export const treatmentGuides: Record<ClassKey, TreatmentGuideContent> = {
  sigatoka: {
    heading: 'Treatment for Black Sigatoka',
    leafImage: blackSigatokaLeaf,
    products: [
      { name: 'Leader 500 SC', description: 'Chlorothalonil fungicide. The Philippine FPA lists banana Sigatoka among its label targets; it helps protect new growth, not heal dead tissue.', sourceUrl: 'https://mirrored.fpa-gov.ph/wp-content/uploads/2026/09/UPDATED-LIST-OF-REGISTERED-PRODUCTS-As-of-August-31-2026-PMID.pdf#page=243' },
    ],
    tips: [
      'Avoid sprinkler irrigation: Use drip irrigation to keep the leaves dry and prevent spore proliferation.',
      'Constant monitoring: Regularly inspect the plant for early signs of the disease.',
      'Balanced fertilization: Apply fertilizers with high potassium content to improve the plant’s resistance.',
    ],
  },
  'cordana-leaf-spot': {
    heading: 'Treatment for Cordana',
    leafImage: cordanaLeaf,
    products: [],
    tips: [
      'Confirm the cause: Cordana can resemble other banana leaf spots. Ask an agriculturist to examine spreading lesions before choosing a fungicide.',
      'Sanitation: Monitor nearby leaves and remove badly damaged material according to local farm guidance.',
      'No matched product yet: We did not find a current Philippine FPA label that specifically names Cordana on banana; do not substitute a Sigatoka product.',
    ],
  },
  healthy: {
    heading: 'Healthy Plant',
    leafImage: healthyLeaf,
    products: [],
    tips: [
      'Keep up good care: Monitor regularly and ensure good air circulation between plants.',
      'Good drainage: Make sure water drains well and use drip irrigation.',
      'Balanced fertilization: Give the plant balanced nutrients for healthy growth.',
    ],
  },
  'panama-disease': {
    heading: 'Panama Disease',
    leafImage: panamaLeaf,
    products: [],
    tips: [
      'No cure: There is no cure or effective spray for Panama Disease; report a suspected case to your agriculturist so it can be confirmed.',
      'Do not move soil or plants: Keep soil, water, suckers and plant parts from the affected plant in place, and clean soil off tools, boots and equipment.',
      'Clean planting material: Plant only disease-free suckers, and ask about resistant varieties before replanting on affected ground.',
    ],
  },
};

export function getTreatmentGuide(id: ClassKey): TreatmentGuideContent {
  const guide = treatmentGuides[id];
  if (!guide) throw new Error(`Unexpected model class: ${id}`);
  return guide;
}
