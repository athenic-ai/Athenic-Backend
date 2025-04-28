test('a simple passing test', () => {
  console.log('Running simple test');
  expect(1 + 1).toBe(2);
});

test('a simple failing test', () => {
  console.log('Running failing test');
  expect(1 + 1).toBe(3);
}); 