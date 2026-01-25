var SCRIPT_OUTCOMES = {
    SUCCESS: 'Success'
};

var OPERATORS = {
    ADD: "ADD",
    SUBTRACT: "SUBTRACT",
    DOT: "DOT",
    CROSS: "CROSS"
}

function add(a, b) {
    return a.map((v, i) => v + b[i]);
}

function subtract(a, b) {
    return a.map((v, i) => v - b[i]);
}

function dot(a, b) {
    return a.reduce((sum, v, i) => sum + v * b[i], 0);
}

function cross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}

function main() {
    if (properties.a.length !== properties.b.length) throw new Error("Vectors not the same dimension.");
    switch (properties.operator) {
        case OPERATORS.ADD:
            nodeState.putShared("c", add(properties.a, properties.b));
            break;
        case OPERATORS.SUBTRACT:
            nodeState.putShared("c", subtract(properties.a, properties.b));
            break;
        case OPERATORS.DOT:
            nodeState.putShared("c", dot(properties.a, properties.b));
            break;
        case OPERATORS.CROSS:
            if (properties.a.length !== 3) throw new Error("Vectors not dimension 3 for cross product");
            nodeState.putShared("c", cross(properties.a, properties.b));
            break;
        default: throw new Error("Unknown operator.");
    }
    action.goTo(SCRIPT_OUTCOMES.SUCCESS);
}

main();
