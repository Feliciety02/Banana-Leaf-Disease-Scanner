import { cleanup, fireEvent, render } from '@testing-library/react-native';

import { GuideScreen } from '../GuideScreen';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('../../../components/ViewableImage', () => ({ ViewableImage: () => null }));
jest.mock('../../library/LibraryScreen', () => {
  const { Text } = require('react-native');
  return { LibraryScreen: () => <Text>Article library</Text> };
});
jest.mock('../../../services/articleLibrary', () => ({ bundledArticles: () => [] }));

afterEach(async () => { await cleanup(); });

it('separates scan conditions from guide only examples and expands practical advice in place', async () => {
  const screen = await render(<GuideScreen />);
  expect(screen.getByText('What the scan can check')).toBeTruthy();
  expect(screen.getByText('Other conditions to know')).toBeTruthy();
  expect(screen.getAllByText('Not checked by scan')).toHaveLength(2);
  expect(screen.queryByText('What to do')).toBeNull();

  await fireEvent.press(screen.getByText('Black Sigatoka'));
  expect(screen.getByText('How to spot it')).toBeTruthy();
  expect(screen.getByText('What to do')).toBeTruthy();

  await fireEvent.press(screen.getByText('Banana Freckle'));
  expect(screen.getByText('Guide only — Banana Freckle is not a scan result.')).toBeTruthy();
  expect(screen.getAllByText('How to spot it')).toHaveLength(1);
  expect(screen.getByText('What the scan can check')).toBeTruthy();
});

it('keeps the Library tab available', async () => {
  const screen = await render(<GuideScreen />);
  await fireEvent.press(screen.getByText('Library'));
  expect(screen.getByText('Article library')).toBeTruthy();
});
