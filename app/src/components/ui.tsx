// Small shared building blocks so every screen looks the same and flips for RTL.
import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, type TextProps, type ViewStyle, type StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../state/settings';
import { radius, space } from '../theme';
import { avatarById } from '../catalog';

export function Txt({ style, muted, size = 16, weight, center, ...rest }: TextProps & { muted?: boolean; size?: number; weight?: '400' | '500' | '600' | '700' | '800'; center?: boolean }) {
  const { c, align, rtl } = useSettings();
  return (
    <Text
      {...rest}
      style={[
        { color: muted ? c.muted : c.text, fontSize: size, fontWeight: weight, textAlign: center ? 'center' : align, writingDirection: rtl ? 'rtl' : 'ltr' },
        style,
      ]}
    />
  );
}

type BtnProps = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
};

export function Btn({ title, onPress, variant = 'primary', loading, disabled, icon, style, small }: BtnProps) {
  const { c, row } = useSettings();
  const bg = { primary: c.primary, secondary: c.cardAlt, danger: c.danger, ghost: 'transparent' }[variant];
  const fg = variant === 'primary' || variant === 'danger' ? c.primaryText : variant === 'ghost' ? c.primary : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, flexDirection: row, opacity: disabled ? 0.45 : pressed ? 0.8 : 1, minHeight: small ? 40 : 54, paddingHorizontal: small ? space(4) : space(5) },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Text style={{ fontSize: small ? 16 : 20, marginHorizontal: 6 }}>{icon}</Text> : null}
          <Text style={{ color: fg, fontSize: small ? 15 : 17, fontWeight: '700' }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({ label, onPress, active, icon }: { label: string; onPress?: () => void; active?: boolean; icon?: string }) {
  const { c, row } = useSettings();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.chip,
        { flexDirection: row, backgroundColor: active ? c.primary : c.cardAlt, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {icon ? <Text style={{ fontSize: 16, marginHorizontal: 4 }}>{icon}</Text> : null}
      <Text style={{ color: active ? c.primaryText : c.text, fontWeight: '600', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useSettings();
  return <View style={[s.card, { backgroundColor: c.card }, style]}>{children}</View>;
}

/** A bottom sheet in a modal, for short tasks (report, incident details). */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const { c } = useSettings();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} onPress={onClose} />
      <View style={[s.sheet, { backgroundColor: c.card, paddingBottom: insets.bottom + space(4) }]}>
        <View style={[s.grabber, { backgroundColor: c.border }]} />
        {children}
      </View>
    </Modal>
  );
}

export function Avatar({ id, size = 44 }: { id: string | null | undefined; size?: number }) {
  const a = avatarById(id);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: a.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.55 }}>{a.emoji}</Text>
    </View>
  );
}

export function RoundButton({ icon, onPress, label, style, color, textColor }: { icon: string; onPress: () => void; label: string; style?: StyleProp<ViewStyle>; color?: string; textColor?: string }) {
  const { c } = useSettings();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [s.round, { backgroundColor: color || c.card, opacity: pressed ? 0.8 : 1 }, style]}
    >
      <Text style={{ fontSize: 22, color: textColor || c.text, fontWeight: '800' }}>{icon}</Text>
    </Pressable>
  );
}

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
};

const s = StyleSheet.create({
  btn: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  chip: { borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(2.5), alignItems: 'center', marginBottom: space(2), marginHorizontal: space(1) },
  card: { borderRadius: radius.lg, padding: space(4), ...shadow },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space(5), paddingTop: space(3), maxHeight: '85%' },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, marginBottom: space(4) },
  round: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', ...shadow },
});

export const shadowStyle = shadow;
