export class CustomError extends Error {
    name = 'CustomError';
    prettyPrintColor = Bun.inspect(this, { colors: true, depth: 10 });
    prettyPrintNoColor = Bun.stripANSI(this.prettyPrintColor);
    toJSON() {
        const obj = {};
        // Include all own properties, including non-enumerable ones like 'message' and 'stack'
        // prettyPrintColor and prettyPrintNoColor are now included automatically as strings
        Object.getOwnPropertyNames(this).forEach((key) => {
            obj[key] = this[key];
        });
        return obj;
    }
}
//# sourceMappingURL=types.js.map