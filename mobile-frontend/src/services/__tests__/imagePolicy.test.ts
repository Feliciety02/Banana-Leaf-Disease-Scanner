import { getHistoryResize } from '../imagePolicy';

describe('history image policy', () => {
  it('keeps small images at their original dimensions', () => {
    expect(getHistoryResize({ width: 1_200, height: 900 })).toBeNull();
  });

  it('caps the longest landscape or portrait edge', () => {
    expect(getHistoryResize({ width: 4_000, height: 3_000 })).toEqual({ width: 1_600 });
    expect(getHistoryResize({ width: 3_000, height: 4_000 })).toEqual({ height: 1_600 });
  });

  it('ignores missing or invalid metadata safely', () => {
    expect(getHistoryResize(null)).toBeNull();
    expect(getHistoryResize({ width: 0, height: 2_000 })).toBeNull();
  });
});
