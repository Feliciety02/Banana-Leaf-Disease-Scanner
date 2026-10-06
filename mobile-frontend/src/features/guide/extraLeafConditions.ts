import type { Language } from '../../i18n';

export type ExtraLeafCondition = {
  id: string;
  image: number;
  imageSource: string;
  sourceUrl: string;
  product?: { name: string; description: Record<Language, string>; sourceUrl: string };
  text: Record<Language, { name: string; summary: string; steps: string[]; note: string }>;
};

// Educational guide entries only. The four-class scan model cannot identify these conditions.
export const extraLeafConditions: ExtraLeafCondition[] = [
  {
    id: 'banana-freckle',
    image: require('../../../assets/figure19_extracted_images/banana-freckle.webp'),
    imageSource: '© State of Queensland / Business Queensland (CC BY 4.0); banana leaf symptoms',
    sourceUrl: 'https://www.business.qld.gov.au/industries/farms-fishing-forestry/agriculture/biosecurity/plants/priority-pest-disease/banana-freckle',
    product: { name: 'Leader 500 SC', description: {
      en: 'Chlorothalonil fungicide; the Philippine FPA lists banana freckles among its label targets.',
      fil: 'Fungicide na chlorothalonil; nakalista sa FPA ang banana freckles bilang isa sa mga target nito.',
      ceb: 'Chlorothalonil nga fungicide; gilista sa FPA ang banana freckles isip usa sa mga target niini.',
    }, sourceUrl: 'https://mirrored.fpa-gov.ph/wp-content/uploads/2026/09/UPDATED-LIST-OF-REGISTERED-PRODUCTS-As-of-August-31-2026-PMID.pdf#page=243' },
    text: {
      en: {
        name: 'Banana Freckle',
        summary: 'Small, rough dark spots on leaves and fruit may join into streaks. The photo shows leaf symptoms.',
        steps: [
          'Check the spots: Freckle spots feel rough like sandpaper; other leaf spots can look similar, so seek confirmation.',
          'Limit spread: Avoid moving infected leaves or planting material and reduce splash between plants.',
          'Ask before spraying: A fungicide may protect new tissue but cannot restore damaged leaves. Confirm the current banana label with an agriculturist.',
        ],
        note: 'Guide only — Banana Freckle is not a scan result.',
      },
      fil: {
        name: 'Banana Freckle',
        summary: 'Maliliit at magagaspang na maiitim na batik sa dahon at bunga na maaaring magdugtong. Sintomas sa dahon ang nasa larawan.',
        steps: [
          'Suriin ang batik: Magaspang na parang liha ang freckle. Maaari itong mapagkamalan sa ibang batik, kaya ipakumpirma.',
          'Pigilan ang pagkalat: Iwasang ilipat ang apektadong dahon o pananim at bawasan ang pagsaboy ng tubig sa mga halaman.',
          'Magtanong bago mag-spray: Napoprotektahan ang bagong tubo ngunit hindi nabubuhay muli ang sirang dahon. Ipakumpirma ang kasalukuyang label sa agriculturist.',
        ],
        note: 'Gabay lamang — hindi kasama ang Banana Freckle sa resulta ng scan.',
      },
      ceb: {
        name: 'Banana Freckle',
        summary: 'Gagmay ug magaspang nga ngitngit nga batik sa dahon ug bunga mahimong maghiusa. Sintomas sa dahon ang naa sa hulagway.',
        steps: [
          'Susiha ang mga batik: Magaspang sama sa liha ang freckle. Mahimong pareho kini sa laing batik, busa ipakumpirma.',
          'Pugngi ang pagkaylap: Ayaw ibalhin ang apektadong dahon o materyal sa pagtanom ug bawasi ang pagsabwag sa tubig.',
          'Pangutana sa dili pa mag-spray: Mahimong mapanalipdan ang bag-ong tubo apan dili maayo ang nadaot nga dahon. Ipakumpirma ang kasamtangang label sa agriculturist.',
        ],
        note: 'Giya lamang — dili resulta sa scan ang Banana Freckle.',
      },
    },
  },
  {
    id: 'banana-bunchy-top',
    image: require('../../../assets/figure19_extracted_images/banana-bunchy-top.webp'),
    imageSource: 'Scot Nelson / Wikimedia Commons (CC0)',
    sourceUrl: 'https://cms.ctahr.hawaii.edu/wangkh/Research-and-Extension/Banana-IPM/Guidebook/CHPT4-IPM-BBTV',
    text: {
      en: {
        name: 'Banana Bunchy Top',
        summary: 'New leaves become short, narrow and upright, often with dark green streaks along veins and leaf stalks.',
        steps: [
          'Seek confirmation: Report a suspected plant to your agriculturist; a photo alone cannot confirm the virus.',
          'Do not move suckers: The virus spreads in infected planting material and by banana aphids.',
          'Contain the mat: There is no curative spray. Follow local advice for aphid control and removal of confirmed infected mats, then replant with virus-free material.',
        ],
        note: 'No curative product — aphid controls do not cure an infected plant. Guide only; this is not a scan result.',
      },
      fil: {
        name: 'Banana Bunchy Top',
        summary: 'Maikli, makitid at pataas ang bagong dahon; maaaring may maitim na berdeng guhit sa ugat at tangkay ng dahon.',
        steps: [
          'Ipakumpirma: Iulat ang pinaghihinalaang halaman sa agriculturist; hindi sapat ang larawan para makumpirma ang virus.',
          'Huwag ilipat ang suhi: Kumakalat ang virus sa apektadong pananim at sa banana aphid.',
          'Pigilan ang pagkalat: Walang spray na nakakagamot. Sundin ang lokal na payo sa aphid at sa pag-alis ng kumpirmadong apektadong puno bago magtanim ng walang virus.',
        ],
        note: 'Walang produktong nakagagamot — hindi ginagamot ng pang-aphid ang apektadong puno. Gabay lamang; hindi ito resulta ng scan.',
      },
      ceb: {
        name: 'Banana Bunchy Top',
        summary: 'Mubo, hiktin ug patindog ang bag-ong mga dahon; kasagaran adunay ngitngit nga berdeng guhit sa ugat ug tangkay.',
        steps: [
          'Ipakumpirma: Ireport ang gituohang apektadong tanom sa agriculturist; dili igo ang hulagway aron makumpirma ang virus.',
          'Ayaw ibalhin ang mga saha: Mikaylap ang virus pinaagi sa apektadong materyal sa pagtanom ug banana aphid.',
          'Pugngi ang pagkaylap: Walay spray nga makatambal. Sunda ang lokal nga tambag sa pagkontrol sa aphid ug pagtangtang sa kumpirmadong apektadong punoan; pagtanom pag-usab gamit ang walay virus nga materyal.',
        ],
        note: 'Walay produkto nga makatambal — ang pang-aphid dili makaayo sa apektadong tanom. Giya lamang; dili kini resulta sa scan.',
      },
    },
  },
];
