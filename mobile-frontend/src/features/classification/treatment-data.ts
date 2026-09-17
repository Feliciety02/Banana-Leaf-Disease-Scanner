import { ClassKey } from './types';

export type TreatmentProduct = {
  name: string;
  description: string;
  price: string;
  image: number;
};

export type TreatmentGuideContent = {
  heading: string;
  leafImage: number | null;
  products: TreatmentProduct[];
  tips: string[];
};

const blackSigatokaLeaf = require('../../../assets/figure19_extracted_images/black_sigatoka_example.jpg');
const cordanaLeaf = require('../../../assets/figure19_extracted_images/cordana_example.jpg');
const healthyLeaf = require('../../../assets/figure19_extracted_images/healthy_leaf_example.jpg');

const timorexGold = require('../../../assets/figure19_extracted_images/timorex_gold.jpg');
const blindax = require('../../../assets/figure19_extracted_images/blindax.jpg');
const sonata = require('../../../assets/figure19_extracted_images/sonata.jpg');
const bordeauxMix = require('../../../assets/figure19_extracted_images/bordeaux_mix_1_percent.jpg');
const kupper500 = require('../../../assets/figure19_extracted_images/kupper_500.jpg');
const topCop = require('../../../assets/figure19_extracted_images/topcop.jpg');

export const treatmentGuides: Record<ClassKey, TreatmentGuideContent> = {
  sigatoka: {
    heading: 'Treatment for Black Sigatoka',
    leafImage: blackSigatokaLeaf,
    products: [
      { name: 'Timorex Gold', description: 'A natural fungicide with the active ingredient from the Melaleuca alternifolia plant extract.', price: '₱941', image: timorexGold },
      { name: 'Blindax', description: 'A liquid fungicide made with organic products.', price: '₱627', image: blindax },
      { name: 'Sonata', description: 'A biological fungicide with multi-site protective action.', price: '₱1,540', image: sonata },
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
    products: [
      { name: 'Bordeaux Mix 1%', description: 'Inorganic fungicide with protective contact action.', price: '₱260', image: bordeauxMix },
      { name: 'Kupper 500', description: 'Broad-spectrum bactericidal fungicide that combats diseases.', price: '₱340', image: kupper500 },
      { name: 'TopCop', description: 'Sulfur-based fungicide that maintains the green color of the tissues.', price: '₱460', image: topCop },
    ],
    tips: [
      'Regular monitoring: Periodically inspect the plant for early signs of the disease.',
      'Avoid leaf contact with the soil: This can reduce the probability of contamination and disease spread.',
      'Balanced fertilization: Use fertilizers with micronutrients, especially potassium, to strengthen the plant.',
    ],
  },
  healthy: {
    heading: 'Healthy Plant',
    leafImage: healthyLeaf,
    products: [],
    tips: [
      'Continue with good care and regular monitoring. Ensure good air circulation between plants.',
      'Provide proper drainage and drip irrigation.',
      'Fertilize the plant with balanced nutrients for healthy growth.',
    ],
  },
  'panama-disease': {
    heading: 'Panama Disease',
    leafImage: null,
    products: [],
    tips: [
      'Leaf patterns resembling Panama Disease require laboratory confirmation before any treatment decision.',
      'Panama Disease is a soil-borne fungal wilt; do not reuse affected soil or plant material.',
    ],
  },
};

export function getTreatmentGuide(id: ClassKey): TreatmentGuideContent {
  const guide = treatmentGuides[id];
  if (!guide) throw new Error(`Unexpected model class: ${id}`);
  return guide;
}