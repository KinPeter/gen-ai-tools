import { createElement as h, Fragment } from "react";

/* ── Regex patterns for JSON token types ─────────────────────────────── */

const STRING = /"(?:\\.|[^"\\])*"/g;
const BOOL_NULL = /\b(?:true|false|null)\b/g;
const NUMBER = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const STRUCT = /[{}[\]:,]/g;

/**
 * Tokenize a JSON string and return React elements with token spans.
 *
 * Keys (strings followed by `:`) get the key token, string values the string
 * token, numbers the value token, booleans the boolean token and null the null
 * token. Structural punctuation gets its own token; whitespace is plain.
 * LogViewer.css maps these token classes to the shared `--tok-*` colours from
 * /assets/syntax.css.
 *
 * Unmatched whitespace between tokens is rendered as plain text nodes
 * so that the `<pre>` element preserves original formatting.
 *
 * @param {string} text - A stringified JSON value.
 * @returns {import("react").ReactElement} Array of colored spans.
 */
export function colorizeJsonText(text) {
  if (!text || text.trim() === "") return null;

  const matches = Array.from(
    text.matchAll(
      new RegExp(
        `(${STRING.source})|(${BOOL_NULL.source})|(${NUMBER.source})|(${STRUCT.source})`,
        "g",
      ),
    ),
  );

  let state = "expecting";
  const context = [];
  let lastPos = 0;

  const elements = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i][0];
    const str = matches[i][1];
    const boolNull = matches[i][2];
    const num = matches[i][3];
    const structural = matches[i][4];

    let type;

    if (str) {
      const isKey =
        state === "expecting" && context[context.length - 1] === "object";
      type = isKey ? "key" : "string";
      state = "afterValue";
    } else if (boolNull) {
      type = boolNull === "null" ? "null" : "boolean";
      state = "afterValue";
    } else if (num) {
      type = "value";
      state = "afterValue";
    } else {
      switch (structural) {
        case "{":
          type = "structural";
          context.push("object");
          state = "expecting";
          break;
        case "[":
          type = "structural";
          context.push("array");
          state = "expecting";
          break;
        case "}":
        case "]":
          type = "structural";
          context.pop();
          state = "afterValue";
          break;
        case ",":
          type = "structural";
          state = "expecting";
          break;
        case ":":
          type = "structural";
          state = "expectingValue";
          break;
      }
    }

    const gap = text.slice(lastPos, matches[i].index);
    if (gap) {
      elements.push(h("span", { key: `g-${i}` }, gap));
    }

    const className = `log-viewer-token-${type}`;
    elements.push(h("span", { key: i, className }, match));
    lastPos = matches[i].index + match.length;
  }

  return h(Fragment, null, ...elements);
}
