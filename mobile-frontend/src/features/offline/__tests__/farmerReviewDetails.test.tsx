import { Text } from 'react-native';
import { cleanup, render } from '@testing-library/react-native';

import { FarmerReviewDetails } from '../FarmerReviewDetails';
import type { DiagnosticReview, LocalDiagnosis } from '../../../storage/localDiagnoses';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('../../../components/ScanLocationControl', () => ({ ScanLocationControl: () => null }));

const item = {
  local_id: 'scan-1', predicted_class: 'sigatoka', confidence: 61,
  image_uri: 'file:///leaf.jpg', owner_user_id: 7,
} as LocalDiagnosis;

function review(overrides: Partial<DiagnosticReview>): DiagnosticReview {
  return {
    id: 11, review_status: 'confirmed', verified_label: 'sigatoka', image_quality: 'good',
    next_steps: ['monitor_plant'], requires_field_inspection: false,
    requested_at: null, reviewed_at: '2026-10-07T02:06:00Z', farmer_follow_up: null,
    reviewer: { id: 3, name: 'Dr. Ana Reyes' },
    ...overrides,
  };
}

afterEach(async () => { await cleanup(); });

it('shows a different expert disease, the farmer message, original AI result, and clearer-photo action', async () => {
  const screen = await render(<FarmerReviewDetails
    item={item}
    review={review({ review_status: 'alternate_class', verified_label: 'panama-disease', image_quality: 'blurry', next_steps: ['retake_photo', 'seek_field_inspection'], farmer_message: 'The image is blurry. Please take a clearer photo.' })}
    onBack={jest.fn()} onOpenPhoto={jest.fn()} onOpenGuide={jest.fn()} onLocationChanged={jest.fn()}
    reply={<Text>Send a clearer photo</Text>}
  />);
  expect(screen.getByText('Panama Disease')).toBeTruthy();
  expect(screen.getByText('The expert thinks this is Panama Disease, not Black Sigatoka.')).toBeTruthy();
  expect(screen.getByText('The image is blurry. Please take a clearer photo.')).toBeTruthy();
  expect(screen.getByText('Send a clearer photo')).toBeTruthy();
  expect(screen.getByText('Black Sigatoka')).toBeTruthy();
  expect(screen.getByText('The agriculturist assessment differs from the original AI result.')).toBeTruthy();
});

it.each([
  ['cannot_determine', 'The expert could not tell from this photo', 'The photo was not clear enough to decide.'],
  ['field_or_laboratory_required', 'The plant needs to be checked in person', 'The photo alone is not enough to decide.'],
  ['possible_outside_supported_classes', 'This may be a different problem', 'It does not look like one of the 3 diseases this app checks.'],
] as const)('shows the correct explanation for %s', async (status, title, explanation) => {
  const screen = await render(<FarmerReviewDetails
    item={item} review={review({ review_status: status, verified_label: null, next_steps: ['seek_field_inspection'] })}
    onBack={jest.fn()} onOpenPhoto={jest.fn()} onLocationChanged={jest.fn()} reply={null}
  />);
  expect(screen.getByText(title)).toBeTruthy();
  expect(screen.getByText(explanation)).toBeTruthy();
  expect(screen.getByText('Black Sigatoka')).toBeTruthy();
});
