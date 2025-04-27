if (typeof window !== 'undefined' && !window.process) {
  window.process = {
    env: {},
    nextTick: function (cb) {
      setTimeout(cb, 0);
    },
    browser: true,
    version: 'v16.0.0',
    platform: 'browser',
    binding: function () {
      return {};
    }
  };
} 