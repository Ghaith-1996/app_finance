import type { HoldingContext } from "./provider";

const LEGAL_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "companies",
  "ltd",
  "limited",
  "llc",
  "plc",
  "sa",
  "nv",
  "ag",
  "spa",
  "holdings",
  "holding",
  "group",
]);

const DOMAIN_SUFFIXES = new Set(["com", "net", "org", "io", "ai"]);

const ROOT_STOPWORDS = new Set([
  "the",
  "and",
  "group",
  "holdings",
  "holding",
  "platforms",
  "technologies",
  "technology",
  "systems",
]);

export interface HoldingNameMetadata extends HoldingContext {
  normalizedCompany: string;
  aliases: string[];
}

export function normalizeMatchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function containsNormalizedTerm(text: string, term: string): boolean {
  const normalizedText = normalizeMatchText(text);
  const normalizedTerm = normalizeMatchText(term);
  if (!normalizedText || !normalizedTerm) return false;
  return ` ${normalizedText} `.includes(` ${normalizedTerm} `);
}

function tokenizeCompanyName(value: string): string[] {
  return normalizeMatchText(value).split(" ").filter(Boolean);
}

function stripTrailingNoise(tokens: string[]): string[] {
  const stripped = [...tokens];

  while (stripped.length > 1 && LEGAL_SUFFIXES.has(stripped[stripped.length - 1])) {
    stripped.pop();
  }

  while (stripped.length > 1 && DOMAIN_SUFFIXES.has(stripped[stripped.length - 1])) {
    stripped.pop();
  }

  return stripped;
}

function toDisplayAlias(alias: string): string {
  return alias
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildHoldingNameMetadata(
  holdings: HoldingContext[],
): HoldingNameMetadata[] {
  const intermediate = holdings.map((holding) => {
    const normalizedCompany = normalizeMatchText(holding.company);
    const strippedTokens = stripTrailingNoise(tokenizeCompanyName(holding.company));
    const rootAlias =
      strippedTokens[0] && !ROOT_STOPWORDS.has(strippedTokens[0])
        ? strippedTokens[0]
        : "";

    return {
      ...holding,
      normalizedCompany,
      strippedTokens,
      baseAlias: strippedTokens.join(" "),
      rootAlias,
    };
  });

  const rootAliasCounts = new Map<string, number>();
  for (const item of intermediate) {
    if (!item.rootAlias) continue;
    rootAliasCounts.set(item.rootAlias, (rootAliasCounts.get(item.rootAlias) ?? 0) + 1);
  }

  return intermediate.map((item) => {
    const aliases = new Set<string>();

    if (item.normalizedCompany) {
      aliases.add(item.normalizedCompany);
    }

    if (item.baseAlias && item.baseAlias !== item.normalizedCompany) {
      if (item.strippedTokens.length > 1 || rootAliasCounts.get(item.baseAlias) === 1) {
        aliases.add(item.baseAlias);
      }
    }

    if (item.rootAlias && rootAliasCounts.get(item.rootAlias) === 1) {
      aliases.add(item.rootAlias);
    }

    return {
      symbol: item.symbol,
      company: item.company,
      sector: item.sector,
      normalizedCompany: item.normalizedCompany,
      aliases: [...aliases],
    };
  });
}

export function holdingAppearsInText(
  normalizedText: string,
  holding: HoldingNameMetadata,
): boolean {
  return (
    containsNormalizedTerm(normalizedText, holding.symbol) ||
    holdingAliasAppearsInText(normalizedText, holding)
  );
}

export function holdingAliasAppearsInText(
  normalizedText: string,
  holding: HoldingNameMetadata,
): boolean {
  return holding.aliases.some((alias) => containsNormalizedTerm(normalizedText, alias));
}

export function formatHoldingForPrompt(
  holding: HoldingContext,
  metadata: HoldingNameMetadata,
): string {
  const shortAliases = metadata.aliases
    .filter((alias) => alias !== metadata.normalizedCompany)
    .map(toDisplayAlias);

  if (shortAliases.length === 0) {
    return `${holding.symbol} (${holding.company}, ${holding.sector})`;
  }

  return `${holding.symbol} (${holding.company}; aliases: ${shortAliases.join(", ")}; ${holding.sector})`;
}
