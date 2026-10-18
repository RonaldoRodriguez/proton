// error.ts
export const Status = {
    Sintax: 0,
    Type: 1,
    Semantic: 2
};

function fmt(name, message, line, column, file) {
    const loc = (line !== undefined && line !== null && column !== undefined && column !== null)
        ? `[${line}:${column}] `
        : '';
    const f = file ? `${file}:${loc}` : loc;
    return `[${name}] ${f}${message}`;
}

export class SintaxisError extends Error {
    constructor(message, line, column, file) {
        super(fmt('SintaxisError', message, line, column, file));
        this.name = 'SintaxisError';
        this.line = line;
        this.column = column;
        this.file = file;
    }
}

export class TypeError extends Error {
    constructor(message, line, column, file) {
        super(fmt('TypeError', message, line, column, file));
        this.name = 'TypeError';
        this.line = line;
        this.column = column;
        this.file = file;
    }
}

export class SemanticError extends Error {
    constructor(message, line, column, file) {
        super(fmt('SemanticError', message, line, column, file));
        this.name = 'SemanticError';
        this.line = line;
        this.column = column;
        this.file = file;
    }
}

export function error(msg, line, column, type = Status.Type, file) {
    switch (type) {
        case Status.Sintax:   throw new SintaxisError(msg, line, column, file);
        case Status.Semantic: throw new SemanticError(msg, line, column, file);
        case Status.Type:
        default:              throw new TypeError(msg, line, column, file);
    }
}