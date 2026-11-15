import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isCalculatedLocationCurrent } from './potentialSite.js';

const result = { request: { lat: -87, lon: 43 } };
const values = { lat: '-87', lon: '43' };

test('site saving is enabled only after a successful calculation for the current coordinates', () => {
  assert.equal(isCalculatedLocationCurrent(null, values, { busy: false, error: null }), false);
  assert.equal(isCalculatedLocationCurrent(result, values, { busy: true, error: null }), false);
  assert.equal(isCalculatedLocationCurrent(result, values, { busy: false, error: new Error() }), false);
  assert.equal(isCalculatedLocationCurrent(result, values, { busy: false, error: null }), true);
});

test('site saving is disabled when coordinates changed after calculating', () => {
  assert.equal(
    isCalculatedLocationCurrent(result, { lat: '-86', lon: '43' }, { busy: false, error: null }),
    false,
  );
});

test('site saving compares normalized east-positive longitude', () => {
  assert.equal(
    isCalculatedLocationCurrent(
      { request: { lat: -87, lon: -10 } },
      { lat: '-87', lon: '350' },
      { busy: false, error: null },
    ),
    true,
  );
});
