import type { DataFile, FileKind, Person, Preference, PreferenceKind } from './types.ts';
import { parseInterestModes, type InterestModesFile } from '../../../interest-modes.ts';
import { jsonChanges } from '../shared/changes.ts';

interface ModesState {
  revision: string;
  data: InterestModesFile;
}

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
export class Store extends EventTarget {
  files: DataFile[] = [];
  people: Person[] = [];
  private dirty = new Set<DataFile>();
  private originals = new Map<DataFile, unknown>();
  modes: ModesState | undefined;
  savedModes: InterestModesFile | undefined;
  busy = false;
  private modesDirty = false;

  private notify(): void {
    this.dispatchEvent(new Event('dirty'));
  }

  async runExclusive(work: () => Promise<void>): Promise<void> {
    if (this.busy) throw new Error('Wait for the current save, reload or mode operation to finish.');
    this.busy = true;
    this.notify();
    try { await work(); }
    finally {
      this.busy = false;
      this.notify();
    }
  }

  private async readModes(): Promise<ModesState> {
    const res = await fetch('/api/modes');
    const body = await res.json() as ModesState & { error?: string };
    if (!res.ok) throw new Error(body.error ?? `Failed to load modes: ${res.status}`);
    return { revision: body.revision, data: parseInterestModes(body.data) };
  }

  private acceptModes(modes: ModesState): void {
    this.modes = modes;
    this.savedModes = structuredClone(modes.data);
    this.modesDirty = false;
    this.dispatchEvent(new Event('modes'));
  }

  async refreshModes(): Promise<void> {
    if (this.modesDirty) throw new Error('Save or reload unsaved mode edits first.');
    this.acceptModes(await this.readModes());
    this.notify();
  }

  touchModes(): void {
    this.modesDirty = JSON.stringify(this.modes?.data) !== JSON.stringify(this.savedModes);
    this.notify();
  }

  get areModesDirty(): boolean { return this.modesDirty; }

  get unsavedChanges() {
    return [
      ...[...this.dirty].map((file) => ({
        path: `Identities/${file.path}`, changes: jsonChanges(this.originals.get(file), file.content),
      })),
      ...(this.modesDirty && this.modes ? [{
        path: 'interest-modes.json', changes: jsonChanges(this.savedModes, this.modes.data),
      }] : []),
    ];
  }

  async load(): Promise<void> {
    await this.runExclusive(() => this.readAll());
  }

  async refreshAfterEmbeddings(): Promise<void> {
    if (this.dirtyCount) throw new Error('Embedding data changed on disk, but drafts are pending. Reload before further editing to pick up refreshed vectors.');
    await this.readAll();
  }

  private async readAll(): Promise<void> {
    const [res, modes] = await Promise.all([fetch('/api/files'), this.readModes()]);
    if (!res.ok) throw new Error(`Failed to load identities: ${res.status}`);
    const raw = (await res.json()) as { path: string; content: unknown }[];
    this.files = raw.map((r) => {
      const [folder, name] = r.path.split('/');
      return { path: r.path, folder, kind: kindOf(name), content: r.content };
    });
    this.people = buildPeople(this.files);
    this.originals = new Map(this.files.map((file) => [file, structuredClone(file.content)]));
    this.dirty.clear();
    this.acceptModes(modes);
    this.dispatchEvent(new Event('loaded'));
  }

  get dirtyCount(): number {
    return this.dirty.size + Number(this.modesDirty);
  }

  isDirty(file: DataFile): boolean {
    return this.dirty.has(file);
  }

  /** Marks the file owning this content object as changed. */
  touch(content: unknown): void {
    const file = this.files.find((f) => f.content === content);
    if (!file) return;
    if (JSON.stringify(file.content) === JSON.stringify(this.originals.get(file))) this.dirty.delete(file);
    else this.dirty.add(file);
    this.dispatchEvent(new Event('dirty'));
  }

  replaceContent(file: DataFile, content: unknown): void {
    file.content = content;
    this.people = buildPeople(this.files);
    this.touch(content);
  }

  async save(): Promise<void> {
    await this.runExclusive(async () => {
      if (this.modesDirty && this.modes) {
        const snapshot = structuredClone(this.modes);
        const res = await fetch('/api/modes', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshot),
        });
        const body = await res.json() as ModesState & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `Failed to save modes: ${res.status}`);
        body.data = parseInterestModes(body.data);
        if (JSON.stringify(this.modes.data) === JSON.stringify(snapshot.data)) this.acceptModes(body);
        else {
          this.modes.revision = body.revision;
          this.savedModes = structuredClone(body.data);
          this.touchModes();
        }
      }
      for (const file of [...this.dirty]) {
        const snapshot: unknown = structuredClone(file.content);
        const res = await fetch(`/api/files?path=${encodeURIComponent(file.path)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshot),
        });
        if (!res.ok) throw new Error(`Failed to save ${file.path}: ${await res.text()}`);
        this.originals.set(file, snapshot);
        this.touch(file.content);
      }
    });
  }

  person(id: string): Person | undefined {
    return this.people.find((p) => p.id === id);
  }

  nameOf(id: string): string {
    return this.person(id)?.identity.name ?? id;
  }

  newPreference(_person: Person, keyword: string, kind: PreferenceKind, affinity: number): Preference {
    return { keyword, kind, affinity, embedding: null };
  }
}

export const store = new Store();
