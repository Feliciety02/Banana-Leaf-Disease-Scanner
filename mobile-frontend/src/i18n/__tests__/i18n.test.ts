jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));

import * as SecureStore from 'expo-secure-store';

import { getLanguage, loadLanguage, setLanguage, translate } from '../index';
import { EN, FIL } from '../strings';
import { CEB } from '../bisaya';
import { className, guideSummary } from '../content';
import { certaintyLevel } from '../../features/scan/ScanResult';

describe('farmer language support', () => {
  it('has Filipino and Bisaya text for every English text, and fills placeholders', () => {
    expect(Object.keys(FIL).sort()).toEqual(Object.keys(EN).sort());
    expect(Object.keys(CEB).sort()).toEqual(Object.keys(EN).sort());
    for (const [key, text] of Object.entries(FIL)) expect(text.trim().length).toBeGreaterThan(0);
    for (const [key, text] of Object.entries(CEB)) expect(text.trim().length).toBeGreaterThan(0);
    expect(translate('en', 'home.greeting', { name: 'Maria' })).toBe('Welcome, Maria');
    expect(translate('fil', 'home.greeting', { name: 'Maria' })).toBe('Maligayang pagdating, Maria');
    expect(translate('ceb', 'home.greeting', { name: 'Maria' })).toBe('Maayong pag-abot, Maria');
  });

  it('keeps the same placeholders in both languages', () => {
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(EN) as (keyof typeof EN)[]) {
      expect(placeholders(FIL[key])).toEqual(placeholders(EN[key]));
      expect(placeholders(CEB[key])).toEqual(placeholders(EN[key]));
    }
  });

  it('remembers the chosen language and restores it on the next start', async () => {
    await setLanguage('fil');
    expect(getLanguage()).toBe('fil');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('dahonmd-language', 'fil');
    await setLanguage('en');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('fil');
    await loadLanguage();
    expect(getLanguage()).toBe('fil');
    await setLanguage('ceb');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('dahonmd-language', 'ceb');
    await setLanguage('en');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('ceb');
    await loadLanguage();
    expect(getLanguage()).toBe('ceb');
  });

  it('translates disease names and descriptions', () => {
    expect(className('healthy', 'fil')).toBe('Malusog');
    expect(className('sigatoka', 'en')).toBe('Black Sigatoka');
    expect(guideSummary('sigatoka', 'fil')).not.toEqual(guideSummary('sigatoka', 'en'));
    expect(className('healthy', 'ceb')).toBe('Himsog');
    expect(guideSummary('sigatoka', 'ceb')).not.toEqual(guideSummary('sigatoka', 'en'));
  });
});

describe('plain-language certainty', () => {
  it('describes the result in words instead of a percentage', () => {
    expect(certaintyLevel(0.92)).toMatchObject({ key: 'result.sure', bars: 3 });
    expect(certaintyLevel(0.75)).toMatchObject({ key: 'result.likely', bars: 2 });
    expect(certaintyLevel(0.4)).toMatchObject({ key: 'result.unsure', bars: 1 });
  });
});
