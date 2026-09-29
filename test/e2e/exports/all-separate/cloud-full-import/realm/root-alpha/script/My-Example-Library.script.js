var i = 0;

function add(j) {i += j};
function logTotal(log) { log.info("Total: " + i) };

// export constant
exports.MSG = 'Final sum';

// export functions
exports.add = add;
exports.logTotal = logTotal;

//direct export using an inline declaration
exports.logTotalWithMessage = (log, message) => log.info(message + ": " + i);
