// __mocks__/styleMock.js
//
// Jest can't parse CSS files because it runs in a Node.js environment,
// not a browser or bundler. When a component imports a .css file
// (like `import "../global.css"` in _layout.tsx), Jest would normally
// throw a syntax error.
//
// This mock replaces any .css import with an empty object, effectively
// telling Jest: "ignore this import, it's just styles."
//
// The mapping is configured in jest.config.js via moduleNameMapper.
module.exports = {};
