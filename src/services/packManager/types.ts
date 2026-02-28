import type { PackIndividual } from '../../types';

export interface PackIndexFile {
  formatVersion: string;
  generatedWith: string;
  individuals: PackIndividual[];
}
