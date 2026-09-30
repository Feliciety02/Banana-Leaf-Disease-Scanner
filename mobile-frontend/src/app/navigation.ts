import type Ionicons from '@expo/vector-icons/Ionicons';

export type TabKey = 'home' | 'scan' | 'history' | 'guide' | 'account' | 'requests' | 'reviewed' | 'content' | 'overview' | 'accounts' | 'diagnoses' | 'knowledge';
type NavItem = { key: TabKey; label: string; active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap };
const account: NavItem = { key: 'account', label: 'Account', active: 'person-circle', inactive: 'person-circle-outline' };
const guide: NavItem = { key: 'guide', label: 'Guide', active: 'book', inactive: 'book-outline' };
const farmer: NavItem[] = [
  { key: 'home', label: 'Home', active: 'home', inactive: 'home-outline' },
  { key: 'scan', label: 'Scan', active: 'scan', inactive: 'scan-outline' },
  { key: 'history', label: 'History', active: 'time', inactive: 'time-outline' }, guide, account,
];
const reviewer: NavItem[] = [
  { key: 'requests', label: 'Requests', active: 'file-tray', inactive: 'file-tray-outline' },
  { key: 'reviewed', label: 'Reviewed', active: 'checkmark-done-circle', inactive: 'checkmark-done-circle-outline' },
  { key: 'content', label: 'Content', active: 'library', inactive: 'library-outline' }, guide, account,
];
const admin: NavItem[] = [
  { key: 'overview', label: 'Overview', active: 'grid', inactive: 'grid-outline' },
  { key: 'accounts', label: 'Users', active: 'people', inactive: 'people-outline' },
  { key: 'diagnoses', label: 'Scans', active: 'images', inactive: 'images-outline' },
  { key: 'knowledge', label: 'Knowledge', active: 'library', inactive: 'library-outline' }, account,
];
export function navigationForRole(role?: string | null): NavItem[] {
  return role === 'admin' ? admin : role === 'agricultural_expert' ? reviewer : farmer;
}
export function landingTab(role?: string | null): TabKey { return navigationForRole(role)[0].key; }
export function validTab(tab: TabKey, role?: string | null): TabKey {
  return navigationForRole(role).some((item) => item.key === tab) ? tab : landingTab(role);
}
