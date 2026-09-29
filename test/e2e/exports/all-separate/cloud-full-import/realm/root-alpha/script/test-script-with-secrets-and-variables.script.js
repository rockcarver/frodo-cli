console.log(`pi: ${systemEnv.getProperty("esv.test.var.pi")}`);
console.log(`pi secret: ${systemEnv.getProperty("esv.test.secret.pi")}`);
console.log(`speed of light: ${systemEnv.getProperty("esv.test.variable.light")}`);
console.log(`euler's number: ${systemEnv.getProperty("esv.test.secret.euler")}`);
console.log(`Area of circle with radius 7: ${7 * 7 * systemEnv.getProperty("esv.test.var.pi")}`);
console.log(`Volume of sphere with radius 7: ${4 * 7 * 7 * 7 * systemEnv.getProperty("esv.test.secret.pi") / 3}`);
