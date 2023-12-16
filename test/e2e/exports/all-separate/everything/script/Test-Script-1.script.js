// Calculate E=mc^2 using m = 42
const c2 = systemEnv.getProperty("esv.test.variable.light");
console.log(`E = ${42 * c2 * c2}`);
// Calculate the area of a circle with radius r = 42
const pi = parseFloat(systemEnv.getProperty("esv.test.secret.pi"));
console.log(`A = ${pi * 42 * 42}`);