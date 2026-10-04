import { CLASS_DISPLAY_NAMES } from '../features/classification/disease-data';
import { getTreatmentGuide } from '../features/classification/treatment-data';
import type { ClassKey } from '../features/classification/types';
import type { Language } from './index';

// Disease names, descriptions and treatment steps in each language. The
// English text comes from treatment-data so the two can never drift apart.

const SUMMARIES: Record<Language, Record<ClassKey, string>> = {
  en: {
    healthy: 'A healthy banana leaf — no disease patterns found. Keep up regular care and monitoring.',
    sigatoka: 'Yellowish streaks and dark blotches that spread across the leaf.',
    'panama-disease': 'The oldest leaves yellow, wilt and collapse around the stem; inside the stem the water channels show reddish-brown streaks.',
    'cordana-leaf-spot': 'Brown oval spots with pale halos that join together near the leaf edge.',
  },
  fil: {
    healthy: 'Malusog na dahon ng saging — walang nakitang palatandaan ng sakit. Ipagpatuloy ang regular na pag-aalaga at pagbabantay.',
    sigatoka: 'Madidilaw na guhit at maiitim na mantsa na kumakalat sa dahon.',
    'panama-disease': 'Naninilaw, nalalanta at bumabagsak sa paligid ng puno ang pinakamatatandang dahon; sa loob ng puno, may mapulang-kayumangging guhit ang mga daluyan ng tubig.',
    'cordana-leaf-spot': 'Kayumangging hugis-itlog na batik na may maputlang paligid, na nagdudugtong malapit sa gilid ng dahon.',
  },
};

const NAMES_FIL: Record<ClassKey, string> = {
  healthy: 'Malusog',
  sigatoka: 'Black Sigatoka',
  'panama-disease': 'Panama disease',
  'cordana-leaf-spot': 'Cordana',
};

const HEADINGS_FIL: Record<ClassKey, string> = {
  healthy: 'Malusog na halaman',
  sigatoka: 'Lunas sa Black Sigatoka',
  'panama-disease': 'Panama disease',
  'cordana-leaf-spot': 'Lunas sa Cordana',
};

// Each tip keeps the "Short title: detail" form so the result screen can show the short title.
const TIPS_FIL: Record<ClassKey, string[]> = {
  sigatoka: [
    'Iwasan ang sprinkler: Gumamit ng drip irrigation para manatiling tuyo ang mga dahon at hindi dumami ang spores.',
    'Bantayan palagi: Regular na tingnan ang halaman para makita agad ang unang palatandaan ng sakit.',
    'Balanseng pataba: Gumamit ng patabang mataas sa potassium para lumakas ang resistensya ng halaman.',
  ],
  'cordana-leaf-spot': [
    'Regular na pagbabantay: Tingnan ang halaman paminsan-minsan para makita agad ang unang palatandaan ng sakit.',
    'Huwag ipadikit sa lupa ang dahon: Nababawasan nito ang pagkahawa at pagkalat ng sakit.',
    'Balanseng pataba: Gumamit ng patabang may micronutrients, lalo na potassium, para lumakas ang halaman.',
  ],
  healthy: [
    'Ipagpatuloy ang pag-aalaga: Regular na bantayan ang halaman at tiyaking maluwag ang hangin sa pagitan ng mga puno.',
    'Maayos na daluyan ng tubig: Siguraduhing hindi nababahaan ang lupa at gumamit ng drip irrigation.',
    'Balanseng pataba: Bigyan ang halaman ng balanseng sustansya para sa malusog na paglaki.',
  ],
  'panama-disease': [
    'Walang gamot: Walang lunas o mabisang spray para sa Panama disease; iulat sa inyong agriculturist ang pinaghihinalaang kaso para makumpirma.',
    'Huwag ilipat ang lupa o halaman: Huwag galawin ang lupa, tubig, suhi o bahagi ng apektadong halaman, at linisin ang lupa sa mga gamit, bota at kagamitan.',
    'Malinis na pananim: Magtanim lang ng walang sakit na suhi, at magtanong tungkol sa matitibay na barayti bago magtanim muli sa apektadong lupa.',
  ],
};

const PRODUCT_DESCRIPTIONS_FIL: Record<string, string> = {
  'Timorex Gold': 'Natural na fungicide na gawa sa katas ng halamang Melaleuca alternifolia.',
  Blindax: 'Likidong fungicide na gawa sa mga organikong sangkap.',
  Sonata: 'Biological na fungicide na nagbibigay ng proteksyon sa iba’t ibang bahagi.',
  'Bordeaux Mix 1%': 'Inorganikong fungicide na nagpoprotekta sa pagdampi.',
  'Kupper 500': 'Malawak ang saklaw na fungicide at bactericide laban sa mga sakit.',
  TopCop: 'Fungicide na batay sa sulfur na tumutulong panatilihing berde ang dahon.',
};

export function className(classKey: ClassKey, language: Language) {
  return language === 'fil' ? NAMES_FIL[classKey] : CLASS_DISPLAY_NAMES[classKey];
}

export function guideSummary(classKey: ClassKey, language: Language) {
  return SUMMARIES[language][classKey];
}

/** The treatment guide with headings, steps and product descriptions in the chosen language. */
export function localizedTreatment(classKey: ClassKey, language: Language) {
  const guide = getTreatmentGuide(classKey);
  if (language === 'en') return guide;
  return {
    ...guide,
    heading: HEADINGS_FIL[classKey],
    tips: TIPS_FIL[classKey],
    products: guide.products.map((product) => ({ ...product, description: PRODUCT_DESCRIPTIONS_FIL[product.name] ?? product.description })),
  };
}

/** Short step titles ("Avoid sprinkler irrigation") for the result screen. */
export function shortSteps(classKey: ClassKey, language: Language, count = 3) {
  return localizedTreatment(classKey, language).tips.map((tip) => tip.split(':')[0]).slice(0, count);
}
