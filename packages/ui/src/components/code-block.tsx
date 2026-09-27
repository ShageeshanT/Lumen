"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { cn } from "../lib/cn";

import { useCopied } from "./copy-field";
import { IconButton } from "./icon-button";

export type CodeLanguage = "bash" | "toml" | "json" | "env" | "text";

type TokenKind = "plain" | "comment" | "string" | "key";

interface Token {
  text: string;
  kind: TokenKind;
}

const TOKEN_CLASS: Record<TokenKind, string | undefined> = {
  plain: undefined,
  // Comments are real text, so they keep 4.5:1 (text-muted is placeholders only).
  comment: "text-text-secondary",
  string: "text-success-text",
  key: "text-accent-text",
};

const STRING = /^("(?:[^"\\]|\\.)*"?|'[^']*'?)/;

/**
 * A deliberately small tokenizer: comments, strings and keys, nothing else
 * (SPEC: no full highlighter). React escapes every token, so content is never
 * interpreted as markup.
 */
export function tokenizeLine(line: string, language: CodeLanguage): Token[] {
  if (language === "text") {
    return [{ text: line, kind: "plain" }];
  }
  const tokens: Token[] = [];
  let rest = line;

  const leading = /^\s*/.exec(rest)?.[0] ?? "";
  if (leading.length > 0) {
    tokens.push({ text: leading, kind: "plain" });
    rest = rest.slice(leading.length);
  }

  // Keys at the start of a line: TOML `key =`, env `KEY=`, JSON `"key":`.
  const keyPattern =
    language === "json"
      ? /^("(?:[^"\\]|\\.)*")(\s*:)/
      : language === "toml" || language === "env"
        ? /^(\[{1,2}[^\]]*\]{1,2}|[A-Za-z0-9_.-]+)(\s*=?)/
        : null;
  if (keyPattern !== null) {
    const match = keyPattern.exec(rest);
    const key = match?.[1];
    const separator = match?.[2];
    if (key !== undefined && separator !== undefined && (separator !== "" || key.startsWith("["))) {
      tokens.push({ text: key, kind: "key" }, { text: separator, kind: "plain" });
      rest = rest.slice(key.length + separator.length);
    }
  }

  let plain = "";
  const flush = () => {
    if (plain.length > 0) {
      tokens.push({ text: plain, kind: "plain" });
      plain = "";
    }
  };
  while (rest.length > 0) {
    const char = rest.charAt(0);
    if (char === "#" && language !== "json" && (plain === "" || /\s$/.test(plain))) {
      flush();
      tokens.push({ text: rest, kind: "comment" });
      rest = "";
      break;
    }
    if (char === '"' || char === "'") {
      const match = STRING.exec(rest);
      if (match?.[0] !== undefined) {
        flush();
        tokens.push({ text: match[0], kind: "string" });
        rest = rest.slice(match[0].length);
        continue;
      }
    }
    plain += char;
    rest = rest.slice(1);
  }
  flush();
  return tokens;
}

export interface CodeBlockProps {
  code: string;
  language?: CodeLanguage;
  lineNumbers?: boolean;
  /** Wrap long lines instead of scrolling sideways. */
  wrap?: boolean;
  /** Show the copy button. On by default. */
  copy?: boolean;
  /** Scroll vertically past this height, with a fade at the bottom edge. */
  maxHeight?: number;
  /** A file name shown in a 32 px header bar, which also names the block. */
  title?: string;
  /** Accessible name when there is no title: "Install command". */
  label?: string;
  className?: string;
}

/**
 * Mono code with minimal coloring, optional line numbers and a copy button.
 * The block is focusable so it can be scrolled by keyboard; ⌘/Ctrl+C inside it
 * copies the selection or, with nothing selected, the whole block.
 */
export function CodeBlock({
  code,
  language = "text",
  lineNumbers = false,
  wrap = false,
  copy = true,
  maxHeight,
  title,
  label,
  className,
}: CodeBlockProps) {
  const { copied, copy: copyText } = useCopied();
  const scrollRef = useRef<HTMLPreElement>(null);
  const [fade, setFade] = useState(false);
  const lines = code.replace(/\n$/, "").split("\n");
  const name = title ?? label ?? "Code";

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null || maxHeight === undefined) {
      return;
    }
    const update = () => {
      setFade(element.scrollHeight - element.scrollTop - element.clientHeight > 1);
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    return () => {
      element.removeEventListener("scroll", update);
    };
  }, [maxHeight, code]);

  const onKeyDown = (event: KeyboardEvent<HTMLPreElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
      const selection = window.getSelection()?.toString() ?? "";
      if (selection.length === 0) {
        event.preventDefault();
        void copyText(code);
      }
    }
  };

  const copyButton = copy && (
    <IconButton
      icon={copied ? "check" : "copy"}
      label={copied ? "Copied" : `Copy ${title ?? label ?? "code"}`}
      size="sm"
      className={cn(copied && "text-success-text")}
      onClick={() => {
        void copyText(code);
      }}
    />
  );

  return (
    <div
      className={cn(
        "group/code border-border bg-bg rounded-card relative flex min-w-0 flex-col border",
        className,
      )}
    >
      {title !== undefined && (
        <div className="border-border flex h-8 shrink-0 items-center justify-between gap-2 border-b pr-1 pl-3">
          <span className="text-12 text-text-secondary truncate font-mono">{title}</span>
          {copyButton}
        </div>
      )}
      <pre
        ref={scrollRef}
        tabIndex={0}
        aria-label={name}
        onKeyDown={onKeyDown}
        className={cn(
          "text-log overflow-auto",
          lineNumbers ? "p-4 pl-0" : "p-3",
          title === undefined && copy && "pr-[40px]",
          wrap ? "break-words whitespace-pre-wrap" : "whitespace-pre",
          lineNumbers && "[counter-reset:line]",
        )}
        style={maxHeight === undefined ? undefined : { maxHeight }}
      >
        <code>
          {lines.map((line, index) => (
            <span
              key={index}
              className={cn(
                "block min-h-5",
                // Line numbers are CSS counters: never copied, never read out, never selectable.
                lineNumbers &&
                  "before:text-11 before:text-text-muted relative pl-12 [counter-increment:line] before:absolute before:left-0 before:w-8 before:text-right before:font-mono before:content-[counter(line)] before:select-none",
              )}
            >
              {tokenizeLine(line, language).map((token, tokenIndex) => (
                <span key={tokenIndex} className={TOKEN_CLASS[token.kind]}>
                  {token.text}
                </span>
              ))}
            </span>
          ))}
        </code>
      </pre>
      {title === undefined && copyButton !== false && (
        <div className="absolute top-1 right-1 opacity-0 transition-opacity duration-[var(--dur-fast)] group-focus-within/code:opacity-100 group-hover/code:opacity-100 [@media(hover:none)]:opacity-100">
          {copyButton}
        </div>
      )}
      {fade && (
        <span
          aria-hidden="true"
          className="from-bg pointer-events-none absolute inset-x-px bottom-px h-8 bg-linear-to-t to-transparent"
        />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </div>
  );
}
