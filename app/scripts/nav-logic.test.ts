// Run: node --experimental-strip-types --test scripts/nav-logic.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instruction, withDistance, isSilent, spokenDistance } from '../src/nav/instructions.ts';
import { cumulative, project, distance, nearestVertex } from '../src/nav/geo.ts';

const step = (type: string, modifier: string | null, extra: object = {}) =>
  ({ type, modifier, exit: null, location: [44.4, 33.3] as [number, number], name: null, ref: null, distance: 0, duration: 0, ...extra });

test('instructions in all three languages', () => {
  assert.equal(instruction(step('turn', 'left', { name: 'Abu Nuwas St' }), 'en'), 'Turn left onto Abu Nuwas St');
  assert.equal(instruction(step('turn', 'right'), 'ar'), 'انعطف يميناً');
  assert.equal(instruction(step('turn', 'right'), 'ckb'), 'بپێچەوە بۆ ڕاست');
  assert.equal(instruction(step('roundabout', 'right', { exit: 2 }), 'ar'), 'في الفلكة، اسلك المخرج الثاني');
  assert.equal(instruction(step('fork', 'slight left'), 'en'), 'Keep left');
  assert.equal(instruction(step('arrive', null), 'ckb'), 'گەیشتیت بە شوێنی مەبەست');
  assert.equal(withDistance('Turn left', 420, 'en'), 'In 400 meters, turn left');
  assert.equal(spokenDistance(1500, 'ar'), '1.5 كيلومتر');
  assert.ok(isSilent(step('new name', 'straight')));
  assert.ok(!isSilent(step('turn', 'left')));
});

test('progress along a route and off-route distance', () => {
  const line: [number, number][] = Array.from({ length: 11 }, (_, i) => [44.40 + i * 0.001, 33.30]);
  const cum = cumulative(line);
  assert.ok(Math.abs(cum[10] - distance(line[0], line[10])) < 1);
  const onRoad = project([44.4055, 33.30], line, cum);
  assert.ok(onRoad.dist < 1);
  assert.ok(Math.abs(onRoad.along - cum[10] * 0.55) < 2);
  const off = project([44.405, 33.3006], line, cum); // ~67 m north
  assert.ok(off.dist > 60 && off.dist < 75, String(off.dist));
  assert.equal(nearestVertex([44.407, 33.30], line), 7);
});
