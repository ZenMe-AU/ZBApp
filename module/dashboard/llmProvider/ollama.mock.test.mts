// Run from parent folder: pnpm exec vitest run llmProvider/ollama.mock.test.mts

import { registerCompatibleProviderMocks } from "./compatibleProviderMock.mjs";

registerCompatibleProviderMocks("ollama");
