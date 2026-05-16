import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { ThemeProvider } from '../context/ThemeContext';
import { GlassButton } from '../components/Glass';

describe('GlassButton snapshots', () => {
  it('primary + secondary variants (mocked blur / gradient)', async () => {
    let primaryTree!: renderer.ReactTestRenderer;
    let secondaryTree!: renderer.ReactTestRenderer;
    await act(async () => {
      primaryTree = renderer.create(
        <ThemeProvider>
          <GlassButton title="Sign in" onPress={() => {}} testID="btn-primary" />
        </ThemeProvider>
      );
      secondaryTree = renderer.create(
        <ThemeProvider>
          <GlassButton
            title="Cancel"
            variant="secondary"
            onPress={() => {}}
            testID="btn-secondary"
          />
        </ThemeProvider>
      );
    });

    expect(primaryTree.toJSON()).toMatchSnapshot();
    expect(secondaryTree.toJSON()).toMatchSnapshot();
  });
});
