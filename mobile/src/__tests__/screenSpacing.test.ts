import { tabTopPadding, stackTopPadding } from '../utils/screenSpacing';

describe('screenSpacing', () => {
  const insets = { top: 44, bottom: 34, left: 0, right: 0 };

  it('computes stable paddings', () => {
    expect({
      tabTop: tabTopPadding(insets),
      stackTop: stackTopPadding(insets),
    }).toMatchSnapshot();
  });
});
