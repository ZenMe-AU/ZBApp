import type { DataFile, FileKind, Person, Preference, PreferenceKind } from './types';

function kindOf(fileName: string): FileKind {
  const match = /-(identity|personas|properties|relations)\.json$/.exec(fileName);
  return (match?.[1] as FileKind | undefined) ?? 'other';
}

function buildPeople(files: DataFile[]): Person[] {
  const byFolder = new Map<string, Partial<Record<FileKind, unknown>>>();
  for (const file of files) {
    const entry = byFolder.get(file.folder) ?? {};
    entry[file.kind] = file.content;
    byFolder.set(file.folder, entry);
  }
  const people: Person[] = [];
  for (const [folder, f] of byFolder) {
    if (!f.identity || !f.personas || !f.properties || !f.relations) continue;
    const identity = f.identity as Person['identity'];
    people.push({
      id: identity.identity_id,
      folder,
      identity,
      personas: f.personas as Person['personas'],
      properties: f.properties as Person['properties'],
      relations: f.relations as Person['relations'],
    });
  }
  return people.sort((a, b) => a.identity.name.localeCompare(b.identity.name));
}

/** Emits 'loaded' after (re)loading from disk and 'dirty' whenever the unsaved set changes. */
class Store extends EventTarget {
  files: DataFile[] = [];
  people: Person[] = [];
  private dirty = new Set<DataFile>();

  async load(): Promise<void> {
    const res = await fetch('/api/files');
    if (!res.ok) throw new Error(`Failed to load identities: ${res.status}`);
    const raw = (await res.json()) as { path: string; content: unknown }[];
    this.files = raw.map((r) => {
      const [folder, name] = r.path.split('/');
      return { path: r.path, folder, kind: kindOf(name), content: r.content };
    });
    this.people = buildPeople(this.files);
    this.dirty.clear();
    this.dispatchEvent(new Event('loaded'));
    this.dispatchEvent(new Event('dirty'));
  }

  get dirtyCount(): number {
    return this.dirty.size;
  }

  isDirty(file: DataFile): boolean {
    return this.dirty.has(file);
  }

  /** Marks the file owning this content object as changed. */
  touch(content: unknown): void {
    const file = this.files.find((f) => f.content === content);
    if (!file) return;
    this.dirty.add(file);
    this.dispatchEvent(new Event('dirty'));
  }

  replaceContent(file: DataFile, content: unknown): void {
    file.content = content;
    this.people = buildPeople(this.files);
    this.touch(content);
  }

  async save(): Promise<void> {
    for (const file of [...this.dirty]) {
      const res = await fetch(`/api/files?path=${encodeURIComponent(file.path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(file.content),
      });
      if (!res.ok) throw new Error(`Failed to save ${file.path}: ${await res.text()}`);
      this.dirty.delete(file);
    }
    this.dispatchEvent(new Event('dirty'));
  }

  person(id: string): Person | undefined {
    return this.people.find((p) => p.id === id);
  }

  nameOf(id: string): string {
    return this.person(id)?.identity.name ?? id;
  }

  newPreference(person: Person, keyword: string, kind: PreferenceKind, affinity: number): Preference {
    return { keyword, kind, affinity, embedding: new Array<number>(person.properties.embedding_model.dimensions).fill(0) };
  }
}

export const store = new Store();
