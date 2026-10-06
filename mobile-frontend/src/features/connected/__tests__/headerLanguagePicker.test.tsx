import { fireEvent, render } from '@testing-library/react-native';
import { HeaderLanguagePicker } from '../AccountUI';
import { setLanguage } from '../../../i18n';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));

it('shows the US and Philippine flags and switches to Bisaya from the header', async () => {
  await setLanguage('en');
  const screen = await render(<HeaderLanguagePicker />);
  await fireEvent.press(screen.getByLabelText('Language: English'));
  expect(screen.getAllByText('🇵🇭')).toHaveLength(2);
  await fireEvent.press(screen.getByText('Tagalog'));
  expect(screen.getByLabelText('Wika: Tagalog')).toBeTruthy();
  expect(screen.getByText('🇵🇭')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Wika: Tagalog'));
  await fireEvent.press(screen.getByText('Bisaya'));
  expect(screen.getByLabelText('Pinulongan: Bisaya')).toBeTruthy();
  expect(screen.getByText('🇵🇭')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Pinulongan: Bisaya'));
  await fireEvent.press(screen.getByText('English'));
  expect(screen.getByText('🇺🇸')).toBeTruthy();
});
