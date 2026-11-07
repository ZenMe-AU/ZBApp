export type FileKind = 'identity' | 'personas' | 'properties' | 'relations' | 'other';
export type PreferenceKind = 'interest' | 'want' | 'value' | 'boundary';
export const preferenceKinds: PreferenceKind[] = ['interest', 'want', 'value', 'boundary'];

export interface IdentityFile {
  identity_id: string;
  name: string;
  age: number;
  gender: string;
  location: string;
  occupation: string;
  summary: string;
  [key: string]: unknown;
}

export interface Persona {
  persona: string;
  connection_goal: string;
  motivation: string;
  contributions: string[];
  expectations: string[];
  important_interests_and_values: string[];
  communication_style: string;
  boundaries: string[];
  initial_disclosure: string;
}

export interface PersonasFile {
  identity_id: string;
  personas: Persona[];
}

export interface Preference {
  keyword: string;
  kind: PreferenceKind;
  affinity: number;
  /** null (or absent) when the keyword changed and the vector has not been regenerated yet. */
  embedding: number[] | null;
}

export interface PropertiesPersona {
  persona: string;
  preferences: Preference[];
}

export interface PropertiesFile {
  identity_id: string;
  embedding_model: { name: string; version: string; dimensions: number };
  personas: PropertiesPersona[];
  kind_vectors?: Record<string, number[]>;
}

export interface Relation {
  contact_ref: string;
  topics_shared: string[];
  topics_private: string[];
  source: string;
}

export interface RelationsFile {
  identity_id: string;
  relations: Relation[];
}

export interface DataFile {
  path: string;
  folder: string;
  kind: FileKind;
  content: unknown;
}

export interface Person {
  id: string;
  folder: string;
  identity: IdentityFile;
  personas: PersonasFile;
  properties: PropertiesFile;
  relations: RelationsFile;
}
