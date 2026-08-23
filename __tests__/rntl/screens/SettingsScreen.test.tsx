/**
 * SettingsScreen Tests
 *
 * Tests for the settings screen including:
 * - Title and version display
 * - Navigation items
 * - Theme selector
 * - Privacy section
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Navigation is globally mocked in jest.setup.ts

jest.mock('../../../src/hooks/useFocusTrigger', () => ({
  useFocusTrigger: () => 0,
}));

jest.mock('../../../src/components', () => ({
  Card: ({ children, style }: any) => {
    const { View } = require('react-native');
    return <View style={style}>{children}</View>;
  },
}));

jest.mock('../../../src/components/AnimatedEntry', () => ({
  AnimatedEntry: ({ children }: any) => children,
}));

jest.mock('../../../src/components/AnimatedListItem', () => ({
  AnimatedListItem: ({ children, onPress, style }: any) => {
    const { TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity style={style} onPress={onPress}>
        {children}
      </TouchableOpacity>
    );
  },
}));

// Mock package.json
jest.mock('../../../package.json', () => ({ version: '1.0.0' }), {
  virtual: true,
});

const mockSetOnboardingComplete = jest.fn();
const mockSetThemeMode = jest.fn();
jest.mock('../../../src/stores', () => ({
  useAppStore: jest.fn((selector?: any) => {
    const state = {
      setOnboardingComplete: mockSetOnboardingComplete,
      themeMode: 'system',
      setThemeMode: mockSetThemeMode,
    };
    return selector ? selector(state) : state;
  }),
}));

import { SettingsScreen } from '../../../src/screens/SettingsScreen';

const mockNavigate = jest.fn();
const mockDispatch = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    getParent: () => ({
      getParent: () => ({
        dispatch: mockDispatch,
      }),
    }),
  }),
  CommonActions: {
    reset: jest.fn((params: any) => params),
  },
}));

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders "Settings" title', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Settings')).toBeTruthy();
  });

  it('renders version number', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('1.0.0')).toBeTruthy();
  });

  it('renders Security navigation item', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Security')).toBeTruthy();
    expect(getByText('Passphrase and app lock')).toBeTruthy();
  });

  it('navigates to SecuritySettings when Security is pressed', () => {
    const { getByText } = render(<SettingsScreen />);
    fireEvent.press(getByText('Security'));
    expect(mockNavigate).toHaveBeenCalledWith('SecuritySettings');
  });

  it('renders theme selector with Appearance label', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Appearance')).toBeTruthy();
  });

  it('renders Privacy First section', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Privacy First')).toBeTruthy();
    expect(
      getByText(/captured and matched entirely on\s+this device/),
    ).toBeTruthy();
  });

  it('renders about section text', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Version')).toBeTruthy();
    expect(getByText(/EleBook helps identify elephants/)).toBeTruthy();
  });

  it('renders Reset Onboarding button in __DEV__ mode', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Reset Onboarding')).toBeTruthy();
  });

  it('calls setOnboardingComplete and dispatches reset on Reset Onboarding press', () => {
    const { CommonActions } = require('@react-navigation/native');
    const { getByText } = render(<SettingsScreen />);
    fireEvent.press(getByText('Reset Onboarding'));

    expect(mockSetOnboardingComplete).toHaveBeenCalledWith(false);
    expect(CommonActions.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Onboarding' }],
    });
    expect(mockDispatch).toHaveBeenCalled();
  });
});
