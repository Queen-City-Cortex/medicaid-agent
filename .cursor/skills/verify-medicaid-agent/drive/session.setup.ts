// Writes the hermetic signed-in session (user_e2e_test / e2e@test.local) with the
// repo's own helper. The session is accepted only by an instance started by
// verify.sh launch, which runs with the matching test cookie password and JWKS stub.
import { test as setup } from '@playwright/test';
import { writeHermeticStorageState } from '../../../../e2e/helpers/test-auth';

setup('mint hermetic session', async () => {
  await writeHermeticStorageState(process.env.VERIFY_AUTH_FILE!);
});
