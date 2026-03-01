import type { NavigatorScreenParams } from '@react-navigation/native';

// ============================================================================
// Wildlife navigation types
// ============================================================================

export type RootStackParamList = {
  Onboarding: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  PackDetails: { packId: string };
  Capture: undefined;
  DetectionResults: { observationId: string };
  MatchReview: { observationId: string; detectionId: string };
  ObservationDetail: { observationId: string };
  Settings: undefined;
  // Legacy routes - will be removed in Task 6.4
  ModelDownload: undefined;
  DownloadManager: undefined;
  Gallery: { conversationId?: string } | undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  PacksTab: undefined;
  ObservationsTab: undefined;
  SyncTab: undefined;
};

// ============================================================================
// Legacy types - will be removed in Task 6.4
// ============================================================================

export type HomeStackParamList = {
  Home: undefined;
};

export type ChatsStackParamList = {
  ChatsList: undefined;
  Chat: { conversationId?: string; projectId?: string };
};

export type ProjectsStackParamList = {
  ProjectsList: undefined;
  ProjectDetail: { projectId: string };
  ProjectEdit: { projectId?: string };
  ProjectChats: { projectId: string };
};

export type ModelsStackParamList = {
  ModelsList: undefined;
  ModelDetail: { modelId: string };
};

export type SettingsStackParamList = {
  SettingsMain: undefined;
  ModelSettings: undefined;
  VoiceSettings: undefined;
  DeviceInfo: undefined;
  StorageSettings: undefined;
  SecuritySettings: undefined;
  PassphraseSetup: undefined;
  ChangePassphrase: undefined;
};
