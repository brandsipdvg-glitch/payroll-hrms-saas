// ---------------------------------------------------------------------------
// Safe formula engine for payroll components.
//
// Supported:
//   arithmetic  +  -  *  /  %
//   comparison  =  ==  !=  <>  <  >  <=  >=
//   logic       AND OR NOT
//   functions   SUM() MIN() MAX() ROUND() IF() ABS() FLOOR() CEIL()
// The evaluator never uses eval/new Function.
// ---------------------------------------------------------------------------

export type FormulaContext = Record<string, number>;

export interface FormulaResult {
  ok: boolean;
  value?: number;
  message?: string;
}

enum Tok {
  Num,
  Ident,
  Op,
  LParen,
  RParen,
  Comma,
  End,
}

interface Token {
  type: Tok;
  value: string;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  const s = src;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch >= "0" && ch <= "9" || ch === ".") {
      let j = i;
      while (j < s.length && ((s[j] >= "0" && s[j] <= "9") || s[j] === ".")) j++;
      tokens.push({ type: Tok.Num, value: s.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      tokens.push({ type: Tok.Ident, value: s.slice(i, j).toUpperCase() });
      i = j;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: Tok.LParen, value: ch });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: Tok.RParen, value: ch });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: Tok.Comma, value: ch });
      i++;
      continue;
    }
    // Multi-char operators: == != <> <= >=
    const two = s.slice(i, i + 2);
    if (two === "==" || two === "!=" || two === "<>" || two === "<=" || two === ">=") {
      tokens.push({ type: Tok.Op, value: two });
      i += 2;
      continue;
    }
    if ("+-*/%<>=&".includes(ch)) {
      tokens.push({ type: Tok.Op, value: ch });
      i++;
      continue;
    }
    // tolerate stray & | as unknown identifiers
    tokens.push({ type: Tok.Ident, value: ch });
    i++;
  }
  tokens.push({ type: Tok.End, value: "" });
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[], private context: FormulaContext) {}

  private peek(): Token {
    return this.tokens[this.pos];
  }
  private next(): Token {
    return this.tokens[this.pos++];
  }
  private expect(t: Tok): Token {
    const tok = this.next();
    if (tok.type !== t) throw new Error(`Expected token near "${tok.value}"`);
    return tok;
  }

  parse(): number {
    const value = this.parseOr();
    this.expect(Tok.End);
    return value;
  }

  private num(tok: Token): number {
    const n = Number(tok.value);
    if (!Number.isFinite(n)) throw new Error(`Invalid number "${tok.value}"`);
    return n;
  }

  private parseOr(): number {
    let left = this.parseAnd();
    while (this.peek().type === Tok.Ident && ["OR"].includes(this.peek().value)) {
      this.next();
      const right = this.parseAnd();
      left = truthy(left) || truthy(right) ? 1 : 0;
    }
    return left;
  }

  private parseAnd(): number {
    let left = this.parseNot();
    while (this.peek().type === Tok.Ident && ["AND"].includes(this.peek().value)) {
      this.next();
      const right = this.parseNot();
      left = truthy(left) && truthy(right) ? 1 : 0;
    }
    return left;
  }

  private parseNot(): number {
    if (this.peek().type === Tok.Ident && this.peek().value === "NOT") {
      this.next();
      return truthy(this.parseNot()) ? 0 : 1;
    }
    return this.parseComparison();
  }

  private parseComparison(): number {
    const left = this.parseAdditive();
    const op = this.peek();
    if (op.type === Tok.Op && ["=", "==", "!=", "<>", "<", ">", "<=", ">="].includes(op.value)) {
      this.next();
      const right = this.parseAdditive();
      switch (op.value) {
        case "=":
        case "==":
          return left === right ? 1 : 0;
        case "!=":
        case "<>":
          return left !== right ? 1 : 0;
        case "<":
          return left < right ? 1 : 0;
        case ">":
          return left > right ? 1 : 0;
        case "<=":
          return left <= right ? 1 : 0;
        case ">=":
          return left >= right ? 1 : 0;
      }
    }
    return left;
  }

  private parseAdditive(): number {
    let left = this.parseMultiplicative();
    while (this.peek().type === Tok.Op && ["+", "-"].includes(this.peek().value)) {
      const op = this.next().value;
      const right = this.parseMultiplicative();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  private parseMultiplicative(): number {
    let left = this.parseUnary();
    while (this.peek().type === Tok.Op && ["*", "/", "%"].includes(this.peek().value)) {
      const op = this.next().value;
      const right = this.parseUnary();
      if (op === "/" && right === 0) throw new Error("Division by zero in formula");
      left = op === "*" ? left * right : op === "/" ? left / right : left % right;
    }
    return left;
  }

  private parseUnary(): number {
    if (this.peek().type === Tok.Op && this.peek().value === "-") {
      this.next();
      return -this.parseUnary();
    }
    if (this.peek().type === Tok.Op && this.peek().value === "+") {
      this.next();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const tok = this.peek();
    if (tok.type === Tok.Num) {
      this.next();
      return this.num(tok);
    }
    if (tok.type === Tok.LParen) {
      this.next();
      const v = this.parseOr();
      this.expect(Tok.RParen);
      return v;
    }
    if (tok.type === Tok.Ident) {
      this.next();
      if (this.peek().type === Tok.LParen) {
        return this.parseFunction(tok.value);
      }
      const key = tok.value;
      if (!(key in this.context)) {
        throw new Error(`Unknown identifier "${key}" in formula`);
      }
      const v = this.context[key];
      if (v === undefined || v === null) throw new Error(`Identifier "${key}" is not computed yet`);
      return v;
    }
    throw new Error(`Unexpected token "${tok.value}"`);
  }

  private parseFunction(name: string): number {
    this.expect(Tok.LParen);
    const args: number[] = [];
    const pushAll = () => {
      if (this.peek().type === Tok.RParen) return;
      // Function must tolerate nested expressions
      const values = [this.parseOr()];
      while (this.peek().type === Tok.Comma) {
        this.next();
        values.push(this.parseOr());
      }
      args.push(...values);
    };
    pushAll();
    this.expect(Tok.RParen);

    switch (name) {
      case "SUM":
        return args.reduce((a, b) => a + b, 0);
      case "MIN":
        if (!args.length) throw new Error("MIN() requires at least one argument");
        return Math.min(...args);
      case "MAX":
        if (!args.length) throw new Error("MAX() requires at least one argument");
        return Math.max(...args);
      case "ROUND":
        if (!args.length) throw new Error("ROUND() requires at least one argument");
        const digits = args.length > 1 ? Math.trunc(args[1]) : 0;
        const factor = Math.pow(10, digits);
        return Math.round(args[0] * factor) / factor;
      case "ABS":
        if (args.length !== 1) throw new Error("ABS() requires exactly one argument");
        return Math.abs(args[0]);
      case "FLOOR":
        if (args.length !== 1) throw new Error("FLOOR() requires exactly one argument");
        return Math.floor(args[0]);
      case "CEIL":
      case "CEILING":
        if (args.length !== 1) throw new Error("CEIL() requires exactly one argument");
        return Math.ceil(args[0]);
      case "IF":
        if (args.length !== 3) throw new Error("IF() requires three arguments: IF(cond, then, else)");
        return truthy(args[0]) ? args[1] : args[2];
      default:
        throw new Error(`Unsupported function "${name}"`);
    }
  }
}

function truthy(v: number): boolean {
  return !Number.isNaN(v) && v !== 0;
}

export function evaluateFormula(formula: string, context: FormulaContext): FormulaResult {
  try {
    const parser = new Parser(tokenize(formula), context ?? {});
    const value = parser.parse();
    if (!Number.isFinite(value)) return { ok: false, message: `Formula produced a non-finite value: ${formula}` };
    return { ok: true, value };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Formula evaluation failed",
    };
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}