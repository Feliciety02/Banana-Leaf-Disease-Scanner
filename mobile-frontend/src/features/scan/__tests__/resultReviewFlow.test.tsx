import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import { ScanScreen } from '../ScanScreen';
import { analyzeLeaf, analyzeBaselineLeaf } from '../../classification/inference';
import { saveLocalDiagnosis, getLocalDiagnosis, claimLocalOnlyDiagnoses } from '../../../storage/localDiagnoses';
import { requestAgriculturalReview } from '../../../services/diagnosisReview';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('../CameraCapture', () => ({ CameraCapture: () => null }));
jest.mock('../SelectedImagePreview', () => ({ SelectedImagePreview: () => null }));
jest.mock('../ImageSelector', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return { ImageSelector: ({ onSelectGallery }: any) => <Pressable onPress={onSelectGallery}><Text>Gallery</Text></Pressable> };
});
jest.mock('../ScanResult', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { ScanResult: () => <Text>AI result</Text> };
});
jest.mock('../../../components/ImageViewer', () => ({ ImageViewer: () => null }));
jest.mock('../../../components/ScanLocationControl', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { ScanLocationControl: () => <Text>Add my location</Text> };
});
jest.mock('../../connected/ui', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    palette: { green: '#18613e', ink: '#111', muted: '#666' },
    ActionButton: ({ children, disabled, onPress }: any) => <Pressable disabled={disabled} onPress={onPress}><Text>{children}</Text></Pressable>,
  };
});
jest.mock('../../classification/inference', () => ({ analyzeLeaf: jest.fn(), analyzeBaselineLeaf: jest.fn() }));
jest.mock('../../classification/preprocessing', () => ({ prepareImageForInference: jest.fn(async () => 'file:///prepared.jpg') }));
jest.mock('../../classification/leafGate', () => ({ checkBananaLeafPhoto: jest.fn(async () => null), LEAF_GATE_BLOCKING: false }));
jest.mock('../scanQuality', () => ({ evaluateImageQuality: jest.fn(async () => ({ issues: [] })) }));
jest.mock('../../../storage/localDiagnoses', () => ({
  saveLocalDiagnosis: jest.fn(), getLocalDiagnosis: jest.fn(), claimLocalOnlyDiagnoses: jest.fn(),
}));
jest.mock('../../../services/diagnosisSync', () => ({ synchronizeDiagnoses: jest.fn(async () => ({})) }));
jest.mock('../../../services/diagnosisReview', () => ({ requestAgriculturalReview: jest.fn() }));
jest.mock('../../../services/reviewNotifications', () => ({ askToNotifyAboutReviews: jest.fn(async () => undefined) }));

const prediction = {
  classKey: 'healthy' as const,
  confidence: 0.9,
  probabilities: [{ classKey: 'healthy' as const, probability: 0.9 }],
  latencyMs: 12,
  modelVersion: 'test',
};
const farmer = { id: 7, role: 'farmer' as const, name: 'Maria', email: 'maria@example.test' };

beforeEach(() => {
  jest.clearAllMocks();
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///leaf.jpg' }] });
  (analyzeLeaf as jest.Mock).mockResolvedValue(prediction);
  (analyzeBaselineLeaf as jest.Mock).mockResolvedValue(prediction);
  (saveLocalDiagnosis as jest.Mock).mockResolvedValue({ local_id: 'leaf-1' });
  (getLocalDiagnosis as jest.Mock).mockResolvedValue({ local_id: 'leaf-1', sync_status: 'synced' });
  (claimLocalOnlyDiagnoses as jest.Mock).mockResolvedValue(0);
  (requestAgriculturalReview as jest.Mock).mockResolvedValue({ review: { review_status: 'pending' } });
});
afterEach(async () => { await cleanup(); });

async function scan(user: typeof farmer | null, onSignIn = jest.fn()) {
  const screen = await render(<ScanScreen user={user} onSignIn={onSignIn} onStored={jest.fn()} onOpenGuide={jest.fn()} onDirtyChange={jest.fn()} modelStatus={{ status: 'real', fingerprints: null }} />);
  await fireEvent.press(screen.getByText('Gallery'));
  await waitFor(() => expect(screen.getByLabelText('Check leaf')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Check leaf'));
  await waitFor(() => expect(screen.getByText('Add my location')).toBeTruthy());
  return screen;
}

it('sends a farmer note from the result and stays on the result after submission', async () => {
  const screen = await scan(farmer);
  await fireEvent.changeText(screen.getByLabelText('Think the AI result is wrong? Tell the agriculturist what you noticed (optional).'), 'The stem is also yellow.');
  await fireEvent.press(screen.getAllByText('Ask an expert').at(-1)!);
  await waitFor(() => expect(requestAgriculturalReview).toHaveBeenCalledWith('leaf-1', 'The stem is also yellow.'));
  expect(screen.getByText('Request sent to an agriculturist')).toBeTruthy();
  expect(screen.getByText('AI result')).toBeTruthy();
  expect(screen.getByText('Add my location')).toBeTruthy();
  expect(screen.queryByText('View in History')).toBeNull();
  expect(screen.queryByText('Share for research')).toBeNull();
});

it('keeps a guest note on the result while the farmer signs in', async () => {
  const onSignIn = jest.fn();
  const screen = await scan(null, onSignIn);
  const note = screen.getByLabelText('Think the AI result is wrong? Tell the agriculturist what you noticed (optional).');
  await fireEvent.changeText(note, 'Spots look different.');
  await fireEvent.press(screen.getAllByText('Ask an expert').at(-1)!);
  expect(onSignIn).toHaveBeenCalledTimes(1);
  expect(requestAgriculturalReview).not.toHaveBeenCalled();
  await screen.rerender(<ScanScreen user={farmer} onSignIn={onSignIn} onStored={jest.fn()} onOpenGuide={jest.fn()} onDirtyChange={jest.fn()} modelStatus={{ status: 'real', fingerprints: null }} />);
  expect(screen.getByLabelText('Think the AI result is wrong? Tell the agriculturist what you noticed (optional).').props.value).toBe('Spots look different.');
  await fireEvent.press(screen.getAllByText('Ask an expert').at(-1)!);
  await waitFor(() => expect(claimLocalOnlyDiagnoses).toHaveBeenCalledWith(7, 'leaf-1'));
  await waitFor(() => expect(requestAgriculturalReview).toHaveBeenCalledWith('leaf-1', 'Spots look different.'));
});
