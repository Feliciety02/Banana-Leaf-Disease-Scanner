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
  ceb: {
    healthy: 'Himsog nga dahon sa saging — walay nakitang timailhan sa sakit. Padayon sa regular nga pag-atiman ug pagbantay.',
    sigatoka: 'Dilaw nga mga guhit ug ngitngit nga mga batik nga mikaylap sa dahon.',
    'panama-disease': 'Ang labing tigulang nga mga dahon modilaw, malaya, ug mahugno palibot sa punoan; adunay pula-kape nga guhit sa sulod sa punoan.',
    'cordana-leaf-spot': 'Kape nga lingin-lingin nga mga batik nga adunay luspad nga palibot ug nagdungan duol sa ngilit sa dahon.',
  },
};

const NAMES_FIL: Record<ClassKey, string> = {
  healthy: 'Malusog',
  sigatoka: 'Black Sigatoka',
  'panama-disease': 'Panama disease',
  'cordana-leaf-spot': 'Cordana',
};

const NAMES_CEB: Record<ClassKey, string> = {
  healthy: 'Himsog',
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

const HEADINGS_CEB: Record<ClassKey, string> = {
  healthy: 'Himsog nga tanom',
  sigatoka: 'Pagtambal sa Black Sigatoka',
  'panama-disease': 'Panama disease',
  'cordana-leaf-spot': 'Pagtambal sa Cordana',
};

// Each tip keeps the "Short title: detail" form so the result screen can show the short title.
const TIPS_FIL: Record<ClassKey, string[]> = {
  sigatoka: [
    'Iwasan ang sprinkler: Gumamit ng drip irrigation para manatiling tuyo ang mga dahon at hindi dumami ang spores.',
    'Bantayan palagi: Regular na tingnan ang halaman para makita agad ang unang palatandaan ng sakit.',
    'Balanseng pataba: Gumamit ng patabang mataas sa potassium para lumakas ang resistensya ng halaman.',
  ],
  'cordana-leaf-spot': [
    'Ipakumpirma ang sanhi: Maaaring mapagkamalan ang Cordana sa ibang batik sa dahon ng saging. Ipasuri sa agriculturist ang kumakalat na mga batik bago pumili ng fungicide.',
    'Panatilihing malinis: Bantayan ang katabing mga dahon at alisin ang malubhang nasirang bahagi ayon sa lokal na payo sa pagsasaka.',
    'Wala pang angkop na produkto: Wala kaming nakitang kasalukuyang FPA label na partikular sa Cordana ng saging; huwag gamitin bilang kapalit ang produkto para sa Sigatoka.',
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

const TIPS_CEB: Record<ClassKey, string[]> = {
  sigatoka: [
    'Likayi ang sprinkler: Gamit og drip irrigation aron magpabiling uga ang mga dahon ug dili modaghan ang spores.',
    'Bantayi kanunay: Susiha ang tanom kanunay aron sayo makita ang mga timailhan sa sakit.',
    'Hustong abono: Gamit og abonong taas og potassium aron molig-on ang resistensya sa tanom.',
  ],
  'cordana-leaf-spot': [
    'Ipakumpirma ang hinungdan: Ang Cordana mahimong masaypan sa ubang batik sa dahon sa saging. Ipasusi sa agriculturist ang mikaylap nga mga batik sa dili pa mopili og fungicide.',
    'Paghinlo: Bantayi ang kasikbit nga mga dahon ug kuhaa ang grabe nga nadaot nga bahin sumala sa lokal nga tambag sa uma.',
    'Wala pay angay nga produkto: Wala kami makakitag kasamtangang FPA label nga espesipiko sa Cordana sa saging; ayaw ipuli ang produkto para sa Sigatoka.',
  ],
  healthy: [
    'Padayon sa pag-atiman: Bantayi kanunay ang tanom ug siguroha nga maayo ang agianan sa hangin tali sa mga punoan.',
    'Maayong agianan sa tubig: Siguroha nga dili mabahaan ang yuta ug gamit og drip irrigation.',
    'Hustong abono: Hatagi ang tanom og balanse nga sustansya aron himsog ang pagtubo.',
  ],
  'panama-disease': [
    'Walay tambal: Walay tambal o epektibong spray para sa Panama disease; ireport ang gituohang kaso sa agriculturist aron makumpirma.',
    'Ayaw ibalhin ang yuta o tanom: Ayaw ibalhin ang yuta, tubig, saha, o bahin sa apektadong tanom; limpyohi ang mga gamit ug botas.',
    'Limpyo nga tanom: Pagtanom lamang og walay sakit nga saha ug pangutana bahin sa lig-on nga barayti sa dili pa magtanom pag-usab.',
  ],
};

const PRODUCT_DESCRIPTIONS_FIL: Record<string, string> = {
  'Leader 500 SC': 'Fungicide na chlorothalonil. Nakalista ng FPA para sa Sigatoka ng saging; proteksiyon ito sa bagong tubo at hindi nakapagpapagaling ng patay na bahagi ng dahon.',
  'Timorex Gold': 'Natural na fungicide na gawa sa katas ng halamang Melaleuca alternifolia.',
  Blindax: 'Likidong fungicide na gawa sa mga organikong sangkap.',
  Sonata: 'Biological na fungicide na nagbibigay ng proteksyon sa iba’t ibang bahagi.',
  'Bordeaux Mix 1%': 'Inorganikong fungicide na nagpoprotekta sa pagdampi.',
  'Kupper 500': 'Malawak ang saklaw na fungicide at bactericide laban sa mga sakit.',
  TopCop: 'Fungicide na batay sa sulfur na tumutulong panatilihing berde ang dahon.',
};

const PRODUCT_DESCRIPTIONS_CEB: Record<string, string> = {
  'Leader 500 SC': 'Chlorothalonil nga fungicide. Gilista sa FPA ang banana Sigatoka isip target niini; mapanalipdan ang bag-ong tubo apan dili makaayo sa patay nga bahin sa dahon.',
  'Timorex Gold': 'Natural nga fungicide nga gihimo gikan sa Melaleuca alternifolia.',
  Blindax: 'Likidong fungicide gikan sa mga organikong sangkap.',
  Sonata: 'Biological nga fungicide nga naghatag og proteksyon sa tanom.',
  'Bordeaux Mix 1%': 'Inorganikong fungicide nga nagpanalipod sa ibabaw sa tanom.',
  'Kupper 500': 'Fungicide ug bactericide nga mosukol sa lain-laing sakit.',
  TopCop: 'Fungicide nga adunay sulfur nga makatabang sa pagpabiling lunhaw sa dahon.',
};

export function className(classKey: ClassKey, language: Language) {
  return language === 'fil' ? NAMES_FIL[classKey] : language === 'ceb' ? NAMES_CEB[classKey] : CLASS_DISPLAY_NAMES[classKey];
}

export function guideSummary(classKey: ClassKey, language: Language) {
  return SUMMARIES[language][classKey];
}

/** The treatment guide with headings, steps and product descriptions in the chosen language. */
export function localizedTreatment(classKey: ClassKey, language: Language) {
  const guide = getTreatmentGuide(classKey);
  if (language === 'en') return guide;
  if (language === 'ceb') return {
    ...guide,
    heading: HEADINGS_CEB[classKey],
    tips: TIPS_CEB[classKey],
    products: guide.products.map((product) => ({ ...product, description: PRODUCT_DESCRIPTIONS_CEB[product.name] ?? product.description })),
  };
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
