import { Disease } from './types';

export const diseases: Disease[] = [
  {
    id: 'healthy', name: 'Healthy', scientific: 'No disease detected', status: 'healthy',
    summary: 'No strong visual indicators of the recognized diseases were found.',
    symptoms: ['Even green coloration', 'Intact leaf surface', 'No expanding lesions'],
    management: 'Continue routine monitoring and maintain balanced irrigation and nutrition.',
  },
  {
    id: 'black-sigatoka', name: 'Black Sigatoka', scientific: 'Pseudocercospora fijiensis', status: 'critical',
    summary: 'A fungal leaf spot disease that reduces photosynthetic area and can cause major yield loss.',
    symptoms: ['Narrow reddish-brown streaks', 'Dark elongated lesions', 'Yellow tissue around lesions'],
    management: 'Remove heavily infected leaves, improve airflow, and consult local agricultural guidance before fungicide use.',
  },
  {
    id: 'yellow-sigatoka', name: 'Yellow Sigatoka', scientific: 'Pseudocercospora musae', status: 'warning',
    summary: 'A fungal disease that develops from pale streaks into necrotic leaf spots.',
    symptoms: ['Pale yellow streaks', 'Brown oval spots', 'Premature leaf drying'],
    management: 'Prune infected material, reduce leaf wetness, and maintain recommended plant spacing.',
  },
  {
    id: 'fusarium-wilt', name: 'Fusarium Wilt', scientific: 'Fusarium oxysporum f. sp. cubense', status: 'critical',
    summary: 'A persistent soil-borne vascular disease that causes yellowing and plant collapse.',
    symptoms: ['Older leaves yellow first', 'Leaf margins wilt', 'Vascular discoloration'],
    management: 'Isolate the plant, disinfect tools, avoid moving contaminated soil, and notify local crop authorities.',
  },
  {
    id: 'bunchy-top', name: 'Banana Bunchy Top', scientific: 'Banana bunchy top virus', status: 'warning',
    summary: 'A viral disease spread by banana aphids that produces narrow, upright, clustered leaves.',
    symptoms: ['Dark dot-dash veins', 'Short narrow leaves', 'Bunched upright crown'],
    management: 'Do not propagate affected plants. Remove infected mats under local guidance and control aphid vectors.',
  },
];

export const getDisease = (id: string) => diseases.find((disease) => disease.id === id) ?? diseases[0];
