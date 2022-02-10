
function lazily<T>(fun: () => T) {
    var memo: [T] = undefined;
    return () => (memo ?? (memo = [fun()]))[0];
}

export { lazily }