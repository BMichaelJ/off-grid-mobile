import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  EmbeddingPack,
  Observation,
  Detection,
  LocalIndividual,
  SyncQueueItem,
} from '../types';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface WildlifeState {
  // Data slices
  packs: EmbeddingPack[];
  observations: Observation[];
  localIndividuals: LocalIndividual[];
  syncQueue: SyncQueueItem[];
  miewidModelPath: string | null;
  nextFieldId: number;

  // Pack actions
  addPack: (pack: EmbeddingPack) => void;
  removePack: (packId: string) => void;

  // Observation actions
  addObservation: (observation: Observation) => void;
  updateDetection: (
    observationId: string,
    detectionId: string,
    updates: Partial<Detection>,
  ) => void;

  // Local individual actions
  addLocalIndividual: (individual: LocalIndividual) => void;
  addEmbeddingToLocalIndividual: (
    localId: string,
    embedding: number[],
    refPhotoUri: string,
  ) => void;

  // Field ID generator
  getNextFieldId: () => string;

  // Sync queue actions
  addToSyncQueue: (item: SyncQueueItem) => void;
  updateSyncStatus: (
    observationId: string,
    updates: Partial<SyncQueueItem>,
  ) => void;

  // MiewID model path
  setMiewidModelPath: (path: string | null) => void;

  // Reset
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Initial data (actions excluded -- they are functions, not persisted)
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  packs: [] as EmbeddingPack[],
  observations: [] as Observation[],
  localIndividuals: [] as LocalIndividual[],
  syncQueue: [] as SyncQueueItem[],
  miewidModelPath: null as string | null,
  nextFieldId: 1,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWildlifeStore = create<WildlifeState>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      // ---- Pack actions ---------------------------------------------------
      addPack: (pack) =>
        set((state) => ({
          packs: [
            ...state.packs.filter((p) => p.id !== pack.id),
            pack,
          ],
        })),

      removePack: (packId) =>
        set((state) => ({
          packs: state.packs.filter((p) => p.id !== packId),
        })),

      // ---- Observation actions --------------------------------------------
      addObservation: (observation) =>
        set((state) => ({
          observations: [...state.observations, observation],
        })),

      updateDetection: (observationId, detectionId, updates) =>
        set((state) => ({
          observations: state.observations.map((obs) =>
            obs.id === observationId
              ? {
                  ...obs,
                  detections: obs.detections.map((det) =>
                    det.id === detectionId ? { ...det, ...updates } : det,
                  ),
                }
              : obs,
          ),
        })),

      // ---- Local individual actions ---------------------------------------
      addLocalIndividual: (individual) =>
        set((state) => ({
          localIndividuals: [...state.localIndividuals, individual],
        })),

      addEmbeddingToLocalIndividual: (localId, embedding, refPhotoUri) =>
        set((state) => ({
          localIndividuals: state.localIndividuals.map((ind) =>
            ind.localId === localId
              ? {
                  ...ind,
                  embeddings: [...ind.embeddings, embedding],
                  referencePhotos: [...ind.referencePhotos, refPhotoUri],
                  encounterCount: ind.encounterCount + 1,
                }
              : ind,
          ),
        })),

      // ---- Field ID generator ---------------------------------------------
      getNextFieldId: () => {
        const { nextFieldId } = get();
        const id = `FIELD-${String(nextFieldId).padStart(3, '0')}`;
        set({ nextFieldId: nextFieldId + 1 });
        return id;
      },

      // ---- Sync queue actions ---------------------------------------------
      addToSyncQueue: (item) =>
        set((state) => ({
          syncQueue: [...state.syncQueue, item],
        })),

      updateSyncStatus: (observationId, updates) =>
        set((state) => ({
          syncQueue: state.syncQueue.map((item) =>
            item.observationId === observationId
              ? { ...item, ...updates }
              : item,
          ),
        })),

      // ---- MiewID model path ----------------------------------------------
      setMiewidModelPath: (path) => set({ miewidModelPath: path }),

      // ---- Reset ----------------------------------------------------------
      reset: () => set({ ...INITIAL_STATE }),
    }),
    {
      name: 'wildlife-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        packs: state.packs,
        observations: state.observations,
        localIndividuals: state.localIndividuals,
        syncQueue: state.syncQueue,
        miewidModelPath: state.miewidModelPath,
        nextFieldId: state.nextFieldId,
      }),
    },
  ),
);
