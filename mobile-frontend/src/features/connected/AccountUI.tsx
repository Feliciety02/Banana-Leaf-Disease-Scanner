import { PropsWithChildren, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { resendVerificationEmail, type SessionUser } from '../../services/api';
import { ActionButton, Notice, palette, titleCase } from './ui';

type IconName = keyof typeof Ionicons.glyphMap;

const ROLE_LABELS: Record<string, string> = { farmer: 'Farmer', agricultural_expert: 'Agricultural reviewer', admin: 'Administrator' };

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/**
 * Sharing features (review requests, photo sharing, reviewer and admin tools)
 * need a verified email. Shown only when the server reports it unverified.
 */
export function EmailVerificationNotice({ user }: { user: SessionUser }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  if (user.email_verified_at !== null) return null;
  const resend = async () => {
    setBusy(true);
    try { setResult({ tone: 'success', text: await resendVerificationEmail() }); }
    catch (error) { setResult({ tone: 'error', text: error instanceof Error ? error.message : 'The verification email could not be sent.' }); }
    finally { setBusy(false); }
  };
  return <View style={styles.verification}>
    <Notice tone="warning">{`Verify your email address to request reviews, share photos and use reviewer or administrator tools. Open the link sent to ${user.email}.`}</Notice>
    {result && <Notice tone={result.tone}>{result.text}</Notice>}
    <ActionButton variant="secondary" icon="mail-outline" disabled={busy} onPress={resend}>{busy ? 'Sending…' : 'Resend verification email'}</ActionButton>
  </View>;
}

/** Avatar, name, email and role at the top of the Account tab. */
export function ProfileHeader({ name, email, role, status }: { name: string; email: string; role: string; status?: { icon: IconName; label: string; tone: 'ok' | 'waiting' } }) {
  return (
    <View style={styles.profile}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{initialsOf(name)}</Text></View>
      <View style={styles.profileCopy}>
        <Text style={styles.profileName} >{name}</Text>
        <Text style={styles.profileEmail} >{email}</Text>
        <View style={styles.badges}>
          <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{ROLE_LABELS[role] ?? titleCase(role)}</Text></View>
          {status && (
            <View style={[styles.statusBadge, status.tone === 'waiting' && styles.statusBadgeWaiting]}>
              <Ionicons name={status.icon} size={13} color={status.tone === 'waiting' ? palette.warning : palette.success} />
              <Text style={[styles.statusBadgeText, status.tone === 'waiting' && styles.statusBadgeTextWaiting]}>{status.label}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

/** Row of small figures (e.g. scans, waiting to upload, reviews). */
export function StatRow({ items }: { items: { value: number | string; label: string; icon: IconName }[] }) {
  return (
    <View style={styles.stats}>
      {items.map((item) => (
        <View key={item.label} style={styles.stat}>
          <Ionicons name={item.icon} size={18} color={palette.green} />
          <Text style={styles.statValue}>{item.value}</Text>
          <Text style={styles.statLabel} numberOfLines={2}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Titled group of settings-style rows. */
export function ListGroup({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

/** One tappable settings row with an icon, text and a trailing chevron/external icon. */
export function ListRow({ icon, title, subtitle, onPress, danger = false, external = false, disabled = false, first = false }: { icon: IconName; title: string; subtitle?: string; onPress?: () => void; danger?: boolean; external?: boolean; disabled?: boolean; first?: boolean }) {
  const content = (
    <>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}><Ionicons name={icon} size={19} color={danger ? palette.danger : palette.green} /></View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, danger && styles.rowTitleDanger]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {onPress ? <Ionicons name={external ? 'open-outline' : 'chevron-forward'} size={17} color={palette.muted} /> : null}
    </>
  );
  if (!onPress) return <View style={[styles.row, !first && styles.rowDivider]}>{content}</View>;
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.row, !first && styles.rowDivider, (pressed || disabled) && styles.rowDim]}>
      {content}
    </Pressable>
  );
}

/** Short benefit line used on the signed-out screen. */
export function Benefit({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <View style={styles.benefit}>
      <View style={styles.benefitIcon}><Ionicons name={icon} size={18} color={palette.green} /></View>
      <View style={styles.rowCopy}>
        <Text style={styles.benefitTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  verification: { gap: 10 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 24, borderRadius: 28, backgroundColor: '#edf5ef', flexWrap: 'wrap' },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: palette.green, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 21, fontWeight: '800' },
  profileCopy: { flex: 1, minWidth: 150, gap: 2 },
  profileName: { color: palette.ink, fontSize: 25, fontWeight: '800' },
  profileEmail: { color: palette.muted, fontSize: 13 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  roleBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: palette.greenSoft },
  roleBadgeText: { color: palette.green, fontSize: 11, fontWeight: '800' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: palette.successSoft },
  statusBadgeWaiting: { backgroundColor: palette.warningSoft },
  statusBadgeText: { color: palette.success, fontSize: 11, fontWeight: '800' },
  statusBadgeTextWaiting: { color: palette.warning },
  stats: { flexDirection: 'row', gap: 8, backgroundColor: '#f5f7f5', borderRadius: 20, padding: 6 },
  stat: { flex: 1, minHeight: 100, gap: 6, padding: 10 },
  statValue: { color: palette.ink, fontSize: 24, fontWeight: '800', marginTop: 2 },
  statLabel: { color: palette.muted, fontSize: 12, lineHeight: 16 },
  group: { gap: 12 },
  groupTitle: { color: palette.ink, fontSize: 20, fontWeight: '800', paddingHorizontal: 4 },
  groupCard: { borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 76, paddingHorizontal: 16, paddingVertical: 16 },
  rowDivider: { borderTopWidth: 1, borderTopColor: palette.border },
  rowDim: { opacity: 0.6 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.greenSoft, alignItems: 'center', justifyContent: 'center' },
  rowIconDanger: { backgroundColor: palette.dangerSoft },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { color: palette.ink, fontSize: 15, fontWeight: '700' },
  rowTitleDanger: { color: palette.danger },
  rowSubtitle: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  benefitIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: palette.greenSoft, alignItems: 'center', justifyContent: 'center' },
  benefitTitle: { color: palette.ink, fontSize: 14, fontWeight: '700' },
});
