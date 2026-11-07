export function createSingleFlight() {
  let inFlight;

  return function run(operation) {
    if (typeof operation !== "function") {
      return Promise.reject(new TypeError("A connection operation must be a function."));
    }
    if (inFlight) return inFlight;

    const task = Promise.resolve().then(operation);
    let shared;
    shared = task.finally(() => {
      if (inFlight === shared) inFlight = undefined;
    });
    inFlight = shared;
    return shared;
  };
}
