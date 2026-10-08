import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AuthModal } from '../AuthModal';
import { register } from '../../../services/api';

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

it('requires the disclosed account agreement and enables research consideration for new signups', async () => {
  const onAuthenticated = jest.fn();
  const screen = await render(<AuthModal mode="register" onClose={jest.fn()} onMode={jest.fn()} onAuthenticated={onAuthenticated} onConnection={jest.fn()} />);
  await fireEvent.changeText(screen.getByLabelText('Full name'), 'Farmer Ana');
  await fireEvent.changeText(screen.getByLabelText('Email address'), 'ana@example.test');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'Correct123!');
  await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'Correct123!');
  await fireEvent.press(screen.getByText('Create account'));
  expect(register).not.toHaveBeenCalled();
  expect(screen.getByText('Please agree to the Terms of Use to create an account.')).toBeTruthy();

  (register as jest.Mock).mockResolvedValue({ id: 1, role: 'farmer', name: 'Farmer Ana', email: 'ana@example.test' });
  await fireEvent.press(screen.getByLabelText('I agree to the Terms of Use and have read the Privacy Policy. Future account scan photos may enter research review after an agriculturist assesses them. An approved private copy may remain after scan deletion. I can withdraw sharing in Account.'));
  await fireEvent.press(screen.getByText('Create account'));
  await waitFor(() => expect(register).toHaveBeenCalledWith('Farmer Ana', 'ana@example.test', 'Correct123!', 'Correct123!', true));
  expect(onAuthenticated).toHaveBeenCalled();
});
