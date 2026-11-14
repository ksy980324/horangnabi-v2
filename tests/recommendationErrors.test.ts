import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recommendationErrorMessage } from '../src/services/recommendationErrors';
import { googleFailure } from '../workers/maps-link/recommendations';

test('Google diagnostics retain allowlisted reasons without returning messages, keys or project metadata',async()=>{
  const response=Response.json({error:{message:'private key and project',details:[{reason:'SERVICE_DISABLED',metadata:{apiKey:'private-key',consumer:'private-project'}}]}},{status:403});
  assert.deepEqual(await googleFailure(response),{reason:'google',providerStatus:403,providerCode:'SERVICE_DISABLED'});
  assert.deepEqual(await googleFailure(Response.json({error:{details:[null,{reason:'private-key'}]}},{status:400})),{reason:'google',providerStatus:400});
  assert.deepEqual(await googleFailure(new Response('<html>private upstream message</html>',{status:502})),{reason:'google',providerStatus:502});
});
test('recommendation diagnostics distinguish provider quotas, app limits, billing and server storage failures',()=>{
  assert.match(recommendationErrorMessage(502,{reason:'google',providerStatus:403,providerCode:'API_KEY_SERVICE_BLOCKED'}),/API 제한.*Places API/);
  assert.match(recommendationErrorMessage(502,{reason:'google',providerStatus:403,providerCode:'BILLING_DISABLED'}),/결제 계정/);
  assert.match(recommendationErrorMessage(503,{reason:'budget-unavailable'}),/BUDGET_UNAVAILABLE/);
  assert.match(recommendationErrorMessage(429,{reason:'google',providerStatus:429}),/Google Places 할당량/);
  assert.match(recommendationErrorMessage(429,{reason:'quota'}),/오늘 또는 이번 달/);
  assert.ok(!recommendationErrorMessage(502,{reason:'google',providerStatus:403,providerCode:'private-key'}).includes('private-key'));
  assert.match(recommendationErrorMessage(502,null),/오류/);
});
