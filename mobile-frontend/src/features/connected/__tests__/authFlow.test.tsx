import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AuthModal } from '../AuthModal';

jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('../../../services/api', () => ({
  hasConnectedConfiguration: () => true,
  subscribeConnection: () => () => undefined,
  login: jest.fn(), register: jest.fn(), requestPasswordReset: jest.fn(), checkConnection: jest.fn(),
}));
jest.mock('../ui', () => {
  const React = require('react');
  const { View, Text, TextInput, Pressable } = require('react-native');
  return {
    palette: {},
    ModalCard: ({ visible, onClose, children }: any) => visible ? <View><Pressable accessibilityLabel="Close form" onPress={onClose}><Text>Close</Text></Pressable>{children}</View> : null,
    Field: ({ label, ...props }: any) => <TextInput accessibilityLabel={label} {...props} />,
    ActionButton: ({ children, onPress, disabled }: any) => <Pressable onPress={onPress} disabled={disabled}><Text>{children}</Text></Pressable>,
    Notice: ({ children }: any) => <Text>{children}</Text>,
  };
});

it('keeps entered credentials across mode changes and asks before discarding', async () => {
  const onClose = jest.fn();
  const props = { onClose, onMode: jest.fn(), onAuthenticated: jest.fn(), onConnection: jest.fn() };
  const screen = await render(<AuthModal mode="login" {...props} />);
  await fireEvent.changeText(screen.getByLabelText('Email address'), 'farmer@example.test');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'Example-password');
  await screen.rerender(<AuthModal mode="register" {...props} />);
  expect(screen.getByLabelText('Email address').props.value).toBe('farmer@example.test');
  expect(screen.getByLabelText('Password').props.value).toBe('Example-password');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await fireEvent.press(screen.getByLabelText('Close form'));
  expect(onClose).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith('Discard entered details?', expect.any(String), expect.any(Array));
  const buttons = alert.mock.calls[0][2]!;
  expect(buttons[0].text).toBe('Keep editing');
  buttons[1].onPress?.();
  expect(onClose).toHaveBeenCalledTimes(1);
  await screen.rerender(<AuthModal mode={null} {...props} />);
  await screen.rerender(<AuthModal mode="login" {...props} />);
  await waitFor(() => expect(screen.getByLabelText('Password').props.value).toBe(''));
  expect(screen.getByLabelText('Email address').props.value).toBe('');
  alert.mockRestore();
});
