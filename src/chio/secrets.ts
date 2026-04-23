/**
 * Real secret detector. Used by the Composer / afterFileEdit hook and by
 * beforeReadFile to scan model output and file contents before they land
 * in the workspace. No stubs: every match here is a real regex hit.
 *
 * Patterns intentionally conservative (high precision, low recall) so we
 * don't false-positive on ordinary prose. The guard pipeline on the arc
 * side will run its own `SecretLeakGuard`; this layer is the last-mile
 * inline refusal before the buffer updates.
 */
export interface SecretFinding {
  /** Short pattern label, e.g. "aws.access_key", "github.pat". */
  kind: string;
  /** The matched literal, truncated to 80 chars for logging. */
  match: string;
  /** Character offset into the scanned text. */
  index: number;
  /** 1-based line number where the match starts. */
  line: number;
}

interface Rule {
  kind: string;
  re: RegExp;
  /**
   * Optional post-match filter. Return `false` to reject the match
   * (e.g. low-entropy cases).
   */
  accept?: (match: string) => boolean;
}

const RULES: Rule[] = [
  // AWS access key id.
  { kind: "aws.access_key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  // AWS temporary session token prefix.
  { kind: "aws.asia_key", re: /\bASIA[0-9A-Z]{16}\b/g },
  // GitHub PATs: `ghp_` (fine-grained), `gho_`, `ghu_`, `ghs_`, `ghr_`.
  { kind: "github.token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g },
  // Stripe live/test secret keys.
  { kind: "stripe.key", re: /\bsk_(?:live|test)_[A-Za-z0-9]{24,}\b/g },
  // Slack bot / user tokens.
  { kind: "slack.token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  // Google API key.
  { kind: "google.api_key", re: /\bAIza[0-9A-Za-z_\-]{35}\b/g },
  // JWT-shaped tokens (three dot-separated base64url segments).
  {
    kind: "jwt",
    re: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g,
  },
  // PEM private-key blocks (RSA, EC, OPENSSH, PGP, generic).
  {
    kind: "pem.private_key",
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g,
  },
  // Generic high-entropy secret adjacent to a credential-ish label.
  // e.g. `password = "kq2B...48k"`, `api_key: "abc...xyz"`, `SECRET = "..."`.
  {
    kind: "generic.credential",
    re: /\b(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|auth[_-]?token|private[_-]?key)\s*[:=]\s*["']([^"'\s]{16,})["']/gi,
    accept: (match) => {
      // Filter out obvious placeholders so we don't flag "password: <REDACTED>".
      const low = match.toLowerCase();
      if (/\b(?:redacted|example|placeholder|changeme|your[_-]?|xxxx|<.*>)\b/.test(low)) return false;
      // Require mixed-class entropy on the value.
      const valueMatch = /["']([^"'\s]+)["']\s*$/.exec(match);
      const value = valueMatch?.[1] ?? "";
      if (value.length < 16) return false;
      const hasUpper = /[A-Z]/.test(value);
      const hasLower = /[a-z]/.test(value);
      const hasDigit = /[0-9]/.test(value);
      // Require at least 2 of 3 character classes and not a single repeating char.
      const classes = Number(hasUpper) + Number(hasLower) + Number(hasDigit);
      if (classes < 2) return false;
      if (/^(.)\1+$/.test(value)) return false;
      return true;
    },
  },
];

/**
 * Scan `text` for secrets. Returns an empty array when clean.
 * Pure function, no I/O; safe to call from a hook hot-path.
 */
export function detectSecrets(text: string): SecretFinding[] {
  if (!text) return [];
  const findings: SecretFinding[] = [];
  for (const rule of RULES) {
    // Reset lastIndex so we can call detectSecrets repeatedly on shared regexes.
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text)) !== null) {
      const raw = m[0];
      if (rule.accept && !rule.accept(raw)) continue;
      findings.push({
        kind: rule.kind,
        match: raw.length > 80 ? `${raw.slice(0, 77)}...` : raw,
        index: m.index,
        line: countLines(text, m.index),
      });
      // Avoid catastrophic loops on zero-width matches (shouldn't happen with
      // our rules, but belt-and-suspenders).
      if (m.index === rule.re.lastIndex) rule.re.lastIndex++;
    }
  }
  // De-dupe by (kind, match, index) since some rules may overlap on
  // edge cases (e.g. a JWT inside a generic credential value).
  const seen = new Set<string>();
  const unique: SecretFinding[] = [];
  for (const f of findings) {
    const key = `${f.kind}::${f.index}::${f.match}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(f);
  }
  unique.sort((a, b) => a.index - b.index);
  return unique;
}

function countLines(text: string, upTo: number): number {
  let n = 1;
  for (let i = 0; i < upTo && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) n++;
  }
  return n;
}
