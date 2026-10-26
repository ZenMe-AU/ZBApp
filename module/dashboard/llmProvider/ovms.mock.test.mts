// Run from parent folder: pnpm exec vitest run llmProvider/ovms.mock.test.mts

import { registerCompatibleProviderMocks } from "./compatibleProviderMock.mjs";

registerCompatibleProviderMocks("ovms");
