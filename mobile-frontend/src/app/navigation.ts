import type Ionicons from '@expo/vector-icons/Ionicons';

export type TabKey = 'home' | 'scan' | 'history' | 'guide' | 'account' | 'reviewed' | 'content' | 'accounts' | 'diagnoses' | 'knowledge';
type NavItem = { key: TabKey; label: string; active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap };
const account: NavItem = { key: 'account', label: 'Account', active: 'person-circle', inactive: 'person-circle-outline' };
const guide: NavItem = { key: 'guide', label: 'Guide', active: 'book', inactive: 'book-outline' };
const home: NavItem = { key: 'home', label: 'Home', active: 'home', inactive: 'home-outline' };
const guest: NavItem[] = [
  { key: 'scan', label: 'Scan', active: 'scan', inactive: 'scan-outline' },
  { key: 'history', label: 'History', active: 'time', inactive: 'time-outline' }, guide, account,
];
const farmer: NavItem[] = [
  home,
  { key: 'scan', label: 'Scan', active: 'scan', inactive: 'scan-outline' },
  { key: 'history', label: 'History', active: 'time', inactive: 'time-outline' }, guide, account,
];
const reviewer: NavItem[] = [
  home,
  { key: 'reviewed', label: 'Reviewed', active: 'checkmark-done-circle', inactive: 'checkmark-done-circle-outline' },
  { key: 'content', label: 'Content', active: 'library', inactive: 'library-outline' }, guide, account,
];
const admin: NavItem[] = [
  home,
  { key: 'accounts', label: 'Users', active: 'people', inactive: 'people-outline' },
  { key: 'diagnoses', label: 'Scans', active: 'images', inactive: 'images-outline' },
  { key: 'knowledge', label: 'Knowledge', active: 'library', inactive: 'library-outline' }, account,
];
export function navigationForRole(role?: string | null): NavItem[] {
  return role === 'admin' ? admin : role === 'agricultural_expert' ? reviewer : role === 'farmer' ? farmer : guest;
}
export function landingTab(role?: string | null): TabKey { return navigationForRole(role)[0].key; }
export function validTab(tab: TabKey, role?: string | null): TabKey {
  return navigationForRole(role).some((item) => item.key === tab) ? tab : landingTab(role);
}
