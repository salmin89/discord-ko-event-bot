import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanity } from '../src/sanity.ts';
test('sanity returns ok', () => { assert.equal(sanity(), 'ok'); });
