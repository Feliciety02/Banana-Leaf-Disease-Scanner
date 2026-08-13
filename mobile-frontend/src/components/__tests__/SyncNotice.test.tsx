import { fireEvent, render } from '@testing-library/react-native';
import { SyncNotice } from '../SyncNotice';

describe('SyncNotice', () => {
  it('shows an actionable failure and retries on press', async () => {
    const onRetry = jest.fn();
    const screen = await render(
      <SyncNotice
        online
        pending={2}
        retryDelayMs={4_000}
        syncError="Server unavailable."
        syncStatus="error"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText(/Retrying in 4 seconds/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('explains that offline scans remain on the device', async () => {
    const screen = await render(
      <SyncNotice
        online={false}
        pending={1}
        retryDelayMs={null}
        syncError={null}
        syncStatus="idle"
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByText(/saved on this device/)).toBeTruthy();
  });
});
