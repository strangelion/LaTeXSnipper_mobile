// Event Registry — modules register their DOM event bindings here.
// main.js calls bindAll() once during boot to wire everything up.

const bindings = [];

export function registerBinding(fn) {
  bindings.push(fn);
}

export function bindAll(els) {
  for (const fn of bindings) fn(els);
}
