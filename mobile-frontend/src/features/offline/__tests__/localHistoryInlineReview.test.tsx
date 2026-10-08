import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';

import { LocalHistory } from '../LocalHistory';
import { listLocalDiagnoses, type LocalDiagnosis } from '../../../storage/localDiagnoses';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('../../../components/ImageViewer', () => ({ ImageViewer: () => null }));
jest.mock('../../../components/ViewableImage', () => ({ ViewableScanImage: () => null }));
jest.mock('../../../components/ScanLocationControl', () => ({ ScanLocationControl: () => null }));
jest.mock('../../../storage/localDiagnoses', () => ({
  listLocalDiagnoses: jest.fn(),
  subscribeToLocalDiagnosisChanges: jest.fn(async () => ({ remove: () => undefined })),
  parseDiagnosisReview: (raw: string | null) => raw ? JSON.parse(raw) : null,
  isNewReview: () => false,
}));

const common = {
  sync_uuid: 'sync-1', server_id: 1, owner_user_id: 7,
  confidence: 61, model_version: 'test', inference_time_ms: 12,
  image_uri: 'file:///leaf.jpg', farmer_notes: null,
  research_consent: 0, research_consent_current: 0,
  source: 'mobile', sync_status: 'synced', last_error: null,
  probabilities_json: null, baseline_json: null, enhanced_json: null,
  diagnosed_at: '2026-10-07T02:00:00Z', created_at: '2026-10-07T02:00:00Z', updated_at: '2026-10-07T02:00:00Z',
} as const;

const reviewed = {
  ...common, local_id: 'reviewed', predicted_class: 'sigatoka',
  review_json: JSON.stringify({
    id: 11, review_status: 'alternate_class', verified_label: 'panama-disease',
    image_quality: 'good', next_steps: ['seek_field_inspection'],
    requires_field_inspection: true, requested_at: '2026-10-07T02:02:00Z',
    reviewed_at: '2026-10-07T02:06:00Z', farmer_seen_at: '2026-10-07T02:07:00Z',
    farmer_message: 'Please have the plant checked.', farmer_follow_up: null,
    reviewer: { id: 3, name: 'Dr. Ana Reyes' },
  }),
} as LocalDiagnosis;
const unreviewed = { ...common, local_id: 'unreviewed', server_id: 2, predicted_class: 'healthy', review_json: null } as LocalDiagnosis;

afterEach(async () => { await cleanup(); jest.clearAllMocks(); });

it('expands reviewed and unreviewed scans inside the same History list with shared detail cards', async () => {
  (listLocalDiagnoses as jest.Mock).mockResolvedValue([reviewed, unreviewed]);
  const screen = await render(<LocalHistory ownerUserId={7} onDirtyChange={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Scan History')).toBeTruthy());

  await fireEvent.press(screen.getByLabelText(/Panama Disease.*Show details/));
  expect(screen.getByText('Scan History')).toBeTruthy();
  expect(screen.getByLabelText(/Healthy.*Show details/)).toBeTruthy();
  expect(screen.getByText('Expert review complete')).toBeTruthy();
  expect(screen.getByText('Original AI screening')).toBeTruthy();
  expect(screen.getByText('Help track possible spread')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText(/Panama Disease.*Hide details/));
  expect(screen.queryByText('Expert review complete')).toBeNull();
  await fireEvent.press(screen.getByLabelText(/Healthy.*Show details/));
  expect(screen.getByText('Scan History')).toBeTruthy();
  expect(screen.getByText('AI screening')).toBeTruthy();
  expect(screen.getByText('View photo')).toBeTruthy();
  expect(screen.getByText('Help track possible spread')).toBeTruthy();
});
